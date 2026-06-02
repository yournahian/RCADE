import { createPublicClient, http, parseAbi } from 'viem';
import { baseSepolia } from 'viem/chains';

import baseSepoliaDeploy from '../contracts/deployments/base-sepolia.json';

export const CHAIN_ID = baseSepolia.id;
export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || baseSepoliaDeploy.nftContract;
export const MARKETPLACE_ADDRESS = process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS || baseSepoliaDeploy.marketplaceContract;

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org")
});

export const RCADE_ERC1155_ABI = parseAbi([
  "function mint(address to, uint256 tokenId, uint256 amount, bytes32 rewardId, bytes memory signature) external",
  "function uri(uint256 tokenId) external view returns (string memory)",
  "function balanceOf(address account, uint256 id) external view returns (uint256)",
  "function usedRewards(bytes32) external view returns (bool)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes memory data) external",
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address account, address operator) external view returns (bool)",
  "event NFTMinted(address indexed to, uint256 indexed tokenId, uint256 amount, bytes32 rewardId)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)"
]);

export const RCADE_MARKETPLACE_ABI = parseAbi([
  "function hashListing(address seller, uint256 tokenId, uint256 amount, uint256 price, uint256 expiry, uint256 nonce) external view returns (bytes32)",
  "function verifySignature(bytes32 listingHash, address seller, bytes memory signature) external pure returns (bool)",
  "function executeSale((address seller, uint256 tokenId, uint256 amount, uint256 price, uint256 expiry, uint256 nonce) listing, bytes signature) external payable",
  "function cancelListing((address seller, uint256 tokenId, uint256 amount, uint256 price, uint256 expiry, uint256 nonce) listing) external",
  "function cancelAllListings() external",
  "function validateListing((address seller, uint256 tokenId, uint256 amount, uint256 price, uint256 expiry, uint256 nonce) listing, bytes signature) external view returns (uint8)",
  "function userNonces(address) external view returns (uint256)",
  "function usedListings(bytes32) external view returns (bool)",
  "function nftContract() external view returns (address)",
  "function treasury() external view returns (address)",
  "function marketplaceFeeBps() external view returns (uint256)",
  "event SaleExecuted(address indexed seller, address indexed buyer, uint256 indexed tokenId, uint256 amount, uint256 price)",
  "event ListingCancelled(bytes32 indexed listingHash)",
  "event AllListingsCancelled(address indexed seller, uint256 newNonce)"
]);

