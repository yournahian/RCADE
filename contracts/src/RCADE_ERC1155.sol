// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract RCADE_ERC1155 is ERC1155, AccessControl, EIP712 {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    bytes32 private constant MINT_TYPEHASH = keccak256(
        "Mint(address to,uint256 tokenId,uint256 amount,bytes32 rewardId)"
    );

    // Track used reward IDs to prevent replay attacks
    mapping(bytes32 => bool) public usedRewards;

    // Events
    event NFTMinted(address indexed to, uint256 indexed tokenId, uint256 amount, bytes32 rewardId);

    constructor() ERC1155("https://rcade.com/api/metadata/{id}") EIP712("RCADE", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function mint(
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes32 rewardId,
        bytes memory signature
    ) external {
        require(!usedRewards[rewardId], "Reward already used");
        
        // EIP-712 typed data hashing
        bytes32 structHash = keccak256(
            abi.encode(
                MINT_TYPEHASH,
                to,
                tokenId,
                amount,
                rewardId
            )
        );
        
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(hash, signature);
        
        require(hasRole(MINTER_ROLE, signer), "Invalid signature or unauthorized minter");

        // Mark as used
        usedRewards[rewardId] = true;

        _mint(to, tokenId, amount, "");
        
        emit NFTMinted(to, tokenId, amount, rewardId);
    }

    function setURI(string memory newuri) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _setURI(newuri);
    }

    // Required override
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
