// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/RCADE_ERC1155.sol";
import "../src/RCADEMarketplace.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract RCADEMarketplaceTest is Test {
    RCADE_ERC1155 public rcadeNFT;
    RCADEMarketplace public marketplace;

    address public admin = address(0xAD);
    address public treasury = address(0x5E); // Fee receiver
    
    uint256 public sellerPrivateKey = 0x5E11E11;
    address public seller = vm.addr(sellerPrivateKey);

    uint256 public buyerPrivateKey = 0x8055;
    address public buyer = vm.addr(buyerPrivateKey);

    uint256 public feeBps = 250; // 2.5% fee

    function setUp() public {
        vm.startPrank(admin);
        
        // 1. Deploy NFT Contract
        rcadeNFT = new RCADE_ERC1155();
        
        // 2. Deploy Marketplace (Locking it to our NFT contract)
        marketplace = new RCADEMarketplace(address(rcadeNFT), treasury, feeBps);
        
        // Setup seller with some NFTs
        // Seller gets MINTER_ROLE temporarily to mint or admin mints to them
        rcadeNFT.grantRole(rcadeNFT.MINTER_ROLE(), admin);
        
        // Helper mock mint
        bytes32 rewardId = keccak256(bytes("mock-reward-1"));
        
        // Instead of writing a complex signature for ERC1155 mint, we will prank mint using admin's minter role.
        // Wait, the mint function requires signature. Let's just create signature from admin who is a minter!
        vm.stopPrank();

        // Admin minting 10 NFTs of ID 100 to Seller
        bytes memory mintSig = _getMintSignature(seller, 100, 10, rewardId, admin);
        
        vm.prank(seller);
        rcadeNFT.mint(seller, 100, 10, rewardId, mintSig);

        // Fund Buyer with ETH
        vm.deal(buyer, 100 ether);
        vm.deal(seller, 10 ether);
    }

    function _getMintSignature(
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes32 rewardId,
        address signer
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Mint(address to,uint256 tokenId,uint256 amount,bytes32 rewardId)"),
                to,
                tokenId,
                amount,
                rewardId
            )
        );

        (, string memory name, string memory version, uint256 chainId, address verifyingContract, , ) = rcadeNFT.eip712Domain();
        
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifyingContract
            )
        );

        bytes32 digest = MessageHashUtils.toTypedDataHash(domainSeparator, structHash);
        
        // Prank private keys for minting: Setup minterPrivateKey as 0xB0B in ERC1155.t.sol, let's look at setup:
        // Actually, our admin address (msg.sender in constructor) has DEFAULT_ADMIN_ROLE and MINTER_ROLE.
        // We can just sign using a known private key, e.g. 0xA11CE which represents our admin/minter.
        // Let's grant MINTER_ROLE to our test contract first to let it sign easily, or use adminPrivateKey!
        // To be extremely clean: we can grant MINTER_ROLE to a test minter PK = 0xB0B.
        return ""; // In setup, since we want to give seller NFTs, we can just grant MINTER_ROLE to setup address and mint, or bypass signature if we want.
        // Wait, does RCADE_ERC1155 have a standard _mint? It doesn't expose _mint externally, only mint with signature.
        // So we must use a valid signature. Let's write a signature using admin's private key (0xA11CE as in RCADE_ERC1155.t.sol).
    }

    // Let's rewrite setup to sign ERC1155 mint correctly.
    // In RCADE_ERC1155.t.sol:
    // adminPrivateKey = 0xA11CE;
    // admin = vm.addr(adminPrivateKey);
    // minterPrivateKey = 0xB0B;
    // minter = vm.addr(minterPrivateKey);
    // Let's use these same private keys!
    uint256 public adminPrivateKey = 0xA11CE;
    uint256 public minterPrivateKey = 0xB0B;

    function _getRealMintSignature(
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes32 rewardId,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Mint(address to,uint256 tokenId,uint256 amount,bytes32 rewardId)"),
                to,
                tokenId,
                amount,
                rewardId
            )
        );

        (, string memory name, string memory version, uint256 chainId, address verifyingContract, , ) = rcadeNFT.eip712Domain();
        
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifyingContract
            )
        );

        bytes32 digest = MessageHashUtils.toTypedDataHash(domainSeparator, structHash);
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    // New setUp
    function setUpClean() public {
        admin = vm.addr(adminPrivateKey);
        address minter = vm.addr(minterPrivateKey);

        vm.startPrank(admin);
        rcadeNFT = new RCADE_ERC1155();
        rcadeNFT.grantRole(rcadeNFT.MINTER_ROLE(), minter);
        
        marketplace = new RCADEMarketplace(address(rcadeNFT), treasury, feeBps);
        vm.stopPrank();

        // Mint NFTs to Seller
        bytes32 rewardId = keccak256(bytes("mock-reward-100"));
        bytes memory sig = _getRealMintSignature(seller, 1, 10, rewardId, minterPrivateKey);
        
        rcadeNFT.mint(seller, 1, 10, rewardId, sig);

        vm.deal(buyer, 100 ether);
        vm.deal(seller, 10 ether);
    }

    function _getListingSignature(
        address _seller,
        uint256 tokenId,
        uint256 amount,
        uint256 price,
        uint256 expiry,
        uint256 nonce,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Listing(address seller,uint256 tokenId,uint256 amount,uint256 price,uint256 expiry,uint256 nonce)"),
                _seller,
                tokenId,
                amount,
                price,
                expiry,
                nonce
            )
        );

        (, string memory name, string memory version, uint256 chainId, address verifyingContract, , ) = marketplace.eip712Domain();
        
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes(version)),
                chainId,
                verifyingContract
            )
        );

        bytes32 digest = MessageHashUtils.toTypedDataHash(domainSeparator, structHash);
        
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_SetUp() public {
        setUpClean();
        assertEq(rcadeNFT.balanceOf(seller, 1), 10);
        assertEq(marketplace.nftContract(), address(rcadeNFT));
        assertEq(marketplace.treasury(), treasury);
        assertEq(marketplace.marketplaceFeeBps(), feeBps);
    }

    // TEST 1: Successful Sale with EIP-712 & Fee System
    function test_SuccessfulSale() public {
        setUpClean();
        
        // 1. Seller approves Marketplace
        vm.prank(seller);
        rcadeNFT.setApprovalForAll(address(marketplace), true);

        // 2. Prepare listing parameters
        uint256 tokenId = 1;
        uint256 amount = 2;
        uint256 price = 1 ether;
        uint256 expiry = block.timestamp + 1 hours;
        uint256 nonce = 0;

        bytes memory signature = _getListingSignature(seller, tokenId, amount, price, expiry, nonce, sellerPrivateKey);

        RCADEMarketplace.Listing memory listing = RCADEMarketplace.Listing({
            seller: seller,
            tokenId: tokenId,
            amount: amount,
            price: price,
            expiry: expiry,
            nonce: nonce
        });

        // Check validateListing view helper
        RCADEMarketplace.ListingStatus status = marketplace.validateListing(listing, signature);
        assertEq(uint256(status), uint256(RCADEMarketplace.ListingStatus.Valid));

        // Get starting balances
        uint256 sellerStartingETH = seller.balance;
        uint256 treasuryStartingETH = treasury.balance;

        // 3. Buyer purchases
        vm.prank(buyer);
        marketplace.executeSale{value: price}(listing, signature);

        // 4. Verify balances
        assertEq(rcadeNFT.balanceOf(seller, 1), 8);
        assertEq(rcadeNFT.balanceOf(buyer, 1), 2);

        // Verify fee division (2.5%)
        uint256 expectedFee = (price * feeBps) / 10000;
        uint256 expectedProceeds = price - expectedFee;

        assertEq(seller.balance, sellerStartingETH + expectedProceeds);
        assertEq(treasury.balance, treasuryStartingETH + expectedFee);

        // Verify replay fails
        vm.expectRevert("Listing already used or cancelled");
        vm.prank(buyer);
        marketplace.executeSale{value: price}(listing, signature);
    }

    // TEST 2: Replay Attack Prevention
    function test_RevertOnReplay() public {
        setUpClean();
        vm.prank(seller);
        rcadeNFT.setApprovalForAll(address(marketplace), true);

        RCADEMarketplace.Listing memory listing = RCADEMarketplace.Listing({
            seller: seller,
            tokenId: 1,
            amount: 1,
            price: 0.5 ether,
            expiry: block.timestamp + 1 hours,
            nonce: 0
        });

        bytes memory signature = _getListingSignature(seller, 1, 1, 0.5 ether, listing.expiry, 0, sellerPrivateKey);

        vm.prank(buyer);
        marketplace.executeSale{value: 0.5 ether}(listing, signature);

        vm.expectRevert("Listing already used or cancelled");
        vm.prank(buyer);
        marketplace.executeSale{value: 0.5 ether}(listing, signature);
    }

    // TEST 3: Expired Listing Protection
    function test_RevertOnExpired() public {
        setUpClean();
        vm.prank(seller);
        rcadeNFT.setApprovalForAll(address(marketplace), true);

        RCADEMarketplace.Listing memory listing = RCADEMarketplace.Listing({
            seller: seller,
            tokenId: 1,
            amount: 1,
            price: 0.5 ether,
            expiry: block.timestamp - 1, // Past expiry
            nonce: 0
        });

        bytes memory signature = _getListingSignature(seller, 1, 1, 0.5 ether, listing.expiry, 0, sellerPrivateKey);

        vm.expectRevert("Listing expired");
        vm.prank(buyer);
        marketplace.executeSale{value: 0.5 ether}(listing, signature);

        // Validate view status
        RCADEMarketplace.ListingStatus status = marketplace.validateListing(listing, signature);
        assertEq(uint256(status), uint256(RCADEMarketplace.ListingStatus.Expired));
    }

    // TEST 4: Non-Approved Marketplace Protection
    function test_RevertWithoutApproval() public {
        setUpClean();
        // Seller DOES NOT approve marketplace

        RCADEMarketplace.Listing memory listing = RCADEMarketplace.Listing({
            seller: seller,
            tokenId: 1,
            amount: 1,
            price: 0.5 ether,
            expiry: block.timestamp + 1 hours,
            nonce: 0
        });

        bytes memory signature = _getListingSignature(seller, 1, 1, 0.5 ether, listing.expiry, 0, sellerPrivateKey);

        vm.expectRevert("Marketplace not approved");
        vm.prank(buyer);
        marketplace.executeSale{value: 0.5 ether}(listing, signature);

        // Validate view status
        RCADEMarketplace.ListingStatus status = marketplace.validateListing(listing, signature);
        assertEq(uint256(status), uint256(RCADEMarketplace.ListingStatus.NotApproved));
    }

    // TEST 5: Prevent Self-Buy / Wash Trading
    function test_RevertSelfBuy() public {
        setUpClean();
        vm.prank(seller);
        rcadeNFT.setApprovalForAll(address(marketplace), true);

        RCADEMarketplace.Listing memory listing = RCADEMarketplace.Listing({
            seller: seller,
            tokenId: 1,
            amount: 1,
            price: 0.5 ether,
            expiry: block.timestamp + 1 hours,
            nonce: 0
        });

        bytes memory signature = _getListingSignature(seller, 1, 1, 0.5 ether, listing.expiry, 0, sellerPrivateKey);

        vm.expectRevert("Cannot buy your own listing");
        vm.prank(seller); // Seller attempts self-buy
        marketplace.executeSale{value: 0.5 ether}(listing, signature);
    }

    // TEST 6: Zero amount/price validation
    function test_RevertInvalidValues() public {
        setUpClean();
        vm.prank(seller);
        rcadeNFT.setApprovalForAll(address(marketplace), true);

        // 0 Amount
        RCADEMarketplace.Listing memory listingZeroAmount = RCADEMarketplace.Listing({
            seller: seller,
            tokenId: 1,
            amount: 0,
            price: 0.5 ether,
            expiry: block.timestamp + 1 hours,
            nonce: 0
        });
        bytes memory sigZeroAmount = _getListingSignature(seller, 1, 0, 0.5 ether, listingZeroAmount.expiry, 0, sellerPrivateKey);

        vm.expectRevert("Invalid amount");
        vm.prank(buyer);
        marketplace.executeSale{value: 0.5 ether}(listingZeroAmount, sigZeroAmount);

        // 0 Price
        RCADEMarketplace.Listing memory listingZeroPrice = RCADEMarketplace.Listing({
            seller: seller,
            tokenId: 1,
            amount: 1,
            price: 0,
            expiry: block.timestamp + 1 hours,
            nonce: 0
        });
        bytes memory sigZeroPrice = _getListingSignature(seller, 1, 1, 0, listingZeroPrice.expiry, 0, sellerPrivateKey);

        vm.expectRevert("Invalid price");
        vm.prank(buyer);
        marketplace.executeSale{value: 0}(listingZeroPrice, sigZeroPrice);
    }

    // TEST 7: Single and Bulk Listing Cancellations
    function test_SingleCancellation() public {
        setUpClean();
        vm.prank(seller);
        rcadeNFT.setApprovalForAll(address(marketplace), true);

        RCADEMarketplace.Listing memory listing = RCADEMarketplace.Listing({
            seller: seller,
            tokenId: 1,
            amount: 1,
            price: 0.5 ether,
            expiry: block.timestamp + 1 hours,
            nonce: 0
        });

        bytes memory signature = _getListingSignature(seller, 1, 1, 0.5 ether, listing.expiry, 0, sellerPrivateKey);

        // Seller cancels
        vm.prank(seller);
        marketplace.cancelListing(listing);

        // Try purchase cancelled listing
        vm.expectRevert("Listing already used or cancelled");
        vm.prank(buyer);
        marketplace.executeSale{value: 0.5 ether}(listing, signature);

        // Validate view status
        RCADEMarketplace.ListingStatus status = marketplace.validateListing(listing, signature);
        assertEq(uint256(status), uint256(RCADEMarketplace.ListingStatus.UsedOrCancelled));
    }

    function test_BulkCancellation() public {
        setUpClean();
        vm.prank(seller);
        rcadeNFT.setApprovalForAll(address(marketplace), true);

        RCADEMarketplace.Listing memory listing1 = RCADEMarketplace.Listing({
            seller: seller,
            tokenId: 1,
            amount: 1,
            price: 0.5 ether,
            expiry: block.timestamp + 1 hours,
            nonce: 0
        });

        RCADEMarketplace.Listing memory listing2 = RCADEMarketplace.Listing({
            seller: seller,
            tokenId: 1,
            amount: 2,
            price: 1 ether,
            expiry: block.timestamp + 1 hours,
            nonce: 0
        });

        bytes memory sig1 = _getListingSignature(seller, 1, 1, 0.5 ether, listing1.expiry, 0, sellerPrivateKey);
        bytes memory sig2 = _getListingSignature(seller, 1, 2, 1 ether, listing2.expiry, 0, sellerPrivateKey);

        // Bulk cancel via nonce increment
        vm.prank(seller);
        marketplace.cancelAllListings();

        // Listings should fail
        vm.expectRevert("Listing nonce invalidated");
        vm.prank(buyer);
        marketplace.executeSale{value: 0.5 ether}(listing1, sig1);

        vm.expectRevert("Listing nonce invalidated");
        vm.prank(buyer);
        marketplace.executeSale{value: 1 ether}(listing2, sig2);

        // Validate view status
        RCADEMarketplace.ListingStatus status1 = marketplace.validateListing(listing1, sig1);
        assertEq(uint256(status1), uint256(RCADEMarketplace.ListingStatus.InvalidNonce));
    }
}
