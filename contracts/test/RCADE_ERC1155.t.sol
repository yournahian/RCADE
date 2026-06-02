// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/RCADE_ERC1155.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract RCADE_ERC1155Test is Test {
    RCADE_ERC1155 public rcade;
    
    uint256 public adminPrivateKey = 0xA11CE;
    address public admin = vm.addr(adminPrivateKey);

    uint256 public minterPrivateKey = 0xB0B;
    address public minter = vm.addr(minterPrivateKey);

    address public user = address(0x123);

    bytes32 private constant MINT_TYPEHASH = keccak256(
        "Mint(address to,uint256 tokenId,uint256 amount,bytes32 rewardId)"
    );

    function setUp() public {
        vm.startPrank(admin);
        rcade = new RCADE_ERC1155();
        rcade.grantRole(rcade.MINTER_ROLE(), minter);
        vm.stopPrank();
    }

    function _getMintSignature(
        address to,
        uint256 tokenId,
        uint256 amount,
        bytes32 rewardId,
        uint256 privateKey
    ) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                MINT_TYPEHASH,
                to,
                tokenId,
                amount,
                rewardId
            )
        );

        // Get the EIP712 domain separator
        (, string memory name, string memory version, uint256 chainId, address verifyingContract, , ) = rcade.eip712Domain();
        
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

    function test_ValidMint() public {
        uint256 tokenId = 1001;
        uint256 amount = 1;
        bytes32 rewardId = keccak256(bytes("reward-123"));

        bytes memory signature = _getMintSignature(user, tokenId, amount, rewardId, minterPrivateKey);

        vm.prank(user); // Any address can broadcast the tx
        rcade.mint(user, tokenId, amount, rewardId, signature);

        assertEq(rcade.balanceOf(user, tokenId), 1);
        assertTrue(rcade.usedRewards(rewardId));
    }

    function test_RevertInvalidSignature() public {
        uint256 tokenId = 1001;
        uint256 amount = 1;
        bytes32 rewardId = keccak256(bytes("reward-123"));

        // Sign with an unauthorized private key
        uint256 unauthorizedPrivateKey = 0xBAD;
        bytes memory signature = _getMintSignature(user, tokenId, amount, rewardId, unauthorizedPrivateKey);

        vm.expectRevert("Invalid signature or unauthorized minter");
        rcade.mint(user, tokenId, amount, rewardId, signature);
    }

    function test_RevertDuplicateRewardMint() public {
        uint256 tokenId = 1001;
        uint256 amount = 1;
        bytes32 rewardId = keccak256(bytes("reward-123"));
        
        // First Mint
        bytes memory signature1 = _getMintSignature(user, tokenId, amount, rewardId, minterPrivateKey);
        rcade.mint(user, tokenId, amount, rewardId, signature1);

        // Attempt duplicate mint with same rewardId (signature is valid but reward is used)
        bytes memory signature2 = _getMintSignature(user, tokenId, amount, rewardId, minterPrivateKey);
        
        vm.expectRevert("Reward already used");
        rcade.mint(user, tokenId, amount, rewardId, signature2);
    }
}
