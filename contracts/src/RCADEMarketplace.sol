// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title RCADEMarketplace
 * @notice Production-hardened EIP-712 marketplace for trading the official RCADE ERC1155 progression token.
 */
contract RCADEMarketplace is ReentrancyGuard, Ownable, EIP712 {
    // Official RCADE ERC1155 token contract
    address public immutable nftContract;

    // Replay protection and cancellation tracking
    mapping(bytes32 => bool) public usedListings;

    // Seller nonce management
    mapping(address => uint256) public userNonces;

    // Fee Configuration
    address public treasury;
    uint256 public marketplaceFeeBps;

    // Struct matching EIP-712 listing payload
    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 amount;
        uint256 price;
        uint256 expiry;
        uint256 nonce;
    }

    enum ListingStatus {
        Valid,
        Expired,
        UsedOrCancelled,
        InvalidNonce,
        InvalidSignature,
        InsufficientBalance,
        NotApproved
    }

    // EIP-712 Listing Typehash
    bytes32 private constant LISTING_TYPEHASH = keccak256(
        "Listing(address seller,uint256 tokenId,uint256 amount,uint256 price,uint256 expiry,uint256 nonce)"
    );

    // Events
    event SaleExecuted(
        address indexed seller,
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 amount,
        uint256 price
    );
    event ListingCancelled(bytes32 indexed listingHash);
    event AllListingsCancelled(address indexed seller, uint256 newNonce);
    event MarketplaceFeeUpdated(uint256 newFeeBps);
    event TreasuryUpdated(address indexed newTreasury);

    constructor(
        address _nftContract,
        address _treasury,
        uint256 _feeBps
    ) EIP712("RCADEMarketplace", "1") Ownable(msg.sender) {
        require(_nftContract != address(0), "Invalid NFT contract address");
        require(_treasury != address(0), "Invalid treasury address");
        require(_feeBps <= 10000, "Fee BPS cannot exceed 100%");
        
        nftContract = _nftContract;
        treasury = _treasury;
        marketplaceFeeBps = _feeBps;
    }

    /**
     * @notice Computes the EIP-712 typed data digest for a listing.
     */
    function hashListing(
        address seller,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 expiry,
        uint256 nonce
    ) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                LISTING_TYPEHASH,
                seller,
                tokenId,
                amount,
                price,
                expiry,
                nonce
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /**
     * @notice Verifies if the EIP-712 signature matches the seller.
     */
    function verifySignature(
        bytes32 listingHash,
        address seller,
        bytes memory signature
    ) public pure returns (bool) {
        return ECDSA.recover(listingHash, signature) == seller;
    }

    /**
     * @notice Atomically executes an ERC1155 sale.
     */
    function executeSale(
        Listing calldata listing,
        bytes calldata signature
    ) external payable nonReentrant {
        // 1. Checks
        require(msg.sender != listing.seller, "Cannot buy your own listing");
        require(listing.amount > 0, "Invalid amount");
        require(listing.price > 0, "Invalid price");
        require(block.timestamp <= listing.expiry, "Listing expired");
        require(listing.nonce >= userNonces[listing.seller], "Listing nonce invalidated");

        bytes32 listingHash = hashListing(
            listing.seller,
            listing.tokenId,
            listing.amount,
            listing.price,
            listing.expiry,
            listing.nonce
        );
        require(!usedListings[listingHash], "Listing already used or cancelled");
        require(msg.value == listing.price, "Incorrect payment amount");

        // Validate signature
        require(verifySignature(listingHash, listing.seller, signature), "Invalid signature");

        // Validate seller balance and approval
        IERC1155 nft = IERC1155(nftContract);
        require(nft.balanceOf(listing.seller, listing.tokenId) >= listing.amount, "Insufficient NFT balance");
        require(nft.isApprovedForAll(listing.seller, address(this)), "Marketplace not approved");

        // 2. Effects
        usedListings[listingHash] = true;

        // 3. Interactions
        // Transfer NFT from seller -> buyer (msg.sender)
        nft.safeTransferFrom(listing.seller, msg.sender, listing.tokenId, listing.amount, "");

        // Fee calculations & distribution
        uint256 fee = (listing.price * marketplaceFeeBps) / 10000;
        
        address royaltyReceiver;
        uint256 royaltyAmount;

        // Try-catch block for future ERC2981 compatibility
        try IERC2981(nftContract).royaltyInfo(listing.tokenId, listing.price) returns (address receiver, uint256 amount) {
            if (receiver != address(0) && amount > 0) {
                royaltyReceiver = receiver;
                royaltyAmount = amount;
            }
        } catch {}

        require(listing.price >= fee + royaltyAmount, "Fee and royalty exceed price");
        uint256 sellerProceeds = listing.price - fee - royaltyAmount;

        // Pay royalty receiver if configured
        if (royaltyAmount > 0 && royaltyReceiver != address(0)) {
            (bool royaltySuccess, ) = payable(royaltyReceiver).call{value: royaltyAmount}("");
            require(royaltySuccess, "Royalty transfer failed");
        }

        // Pay marketplace fee to treasury
        if (fee > 0) {
            (bool feeSuccess, ) = payable(treasury).call{value: fee}("");
            require(feeSuccess, "Treasury transfer failed");
        }

        // Pay seller proceeds
        (bool proceedsSuccess, ) = payable(listing.seller).call{value: sellerProceeds}("");
        require(proceedsSuccess, "Seller proceeds transfer failed");

        emit SaleExecuted(
            listing.seller,
            msg.sender,
            listing.tokenId,
            listing.amount,
            listing.price
        );
    }

    /**
     * @notice Securely cancels a single listing.
     */
    function cancelListing(Listing calldata listing) external {
        require(msg.sender == listing.seller, "Only seller can cancel");
        
        bytes32 listingHash = hashListing(
            listing.seller,
            listing.tokenId,
            listing.amount,
            listing.price,
            listing.expiry,
            listing.nonce
        );
        
        require(!usedListings[listingHash], "Listing already used or cancelled");
        usedListings[listingHash] = true;

        emit ListingCancelled(listingHash);
    }

    /**
     * @notice Bulk invalidation of all listings signed with previous nonces.
     */
    function cancelAllListings() external {
        userNonces[msg.sender]++;
        emit AllListingsCancelled(msg.sender, userNonces[msg.sender]);
    }

    /**
     * @notice Helper view function for frontend/indexer listing status checks.
     */
    function validateListing(
        Listing calldata listing,
        bytes calldata signature
    ) external view returns (ListingStatus) {
        if (block.timestamp > listing.expiry) {
            return ListingStatus.Expired;
        }
        
        bytes32 listingHash = hashListing(
            listing.seller,
            listing.tokenId,
            listing.amount,
            listing.price,
            listing.expiry,
            listing.nonce
        );
        
        if (usedListings[listingHash]) {
            return ListingStatus.UsedOrCancelled;
        }
        
        if (listing.nonce < userNonces[listing.seller]) {
            return ListingStatus.InvalidNonce;
        }
        
        if (!verifySignature(listingHash, listing.seller, signature)) {
            return ListingStatus.InvalidSignature;
        }
        
        IERC1155 nft = IERC1155(nftContract);
        if (nft.balanceOf(listing.seller, listing.tokenId) < listing.amount) {
            return ListingStatus.InsufficientBalance;
        }
        
        if (!nft.isApprovedForAll(listing.seller, address(this))) {
            return ListingStatus.NotApproved;
        }
        
        return ListingStatus.Valid;
    }

    /**
     * @notice Updates the marketplace fee.
     */
    function setMarketplaceFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 10000, "Fee BPS cannot exceed 100%");
        marketplaceFeeBps = newFeeBps;
        emit MarketplaceFeeUpdated(newFeeBps);
    }

    /**
     * @notice Updates the treasury address.
     */
    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid treasury address");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }
}
