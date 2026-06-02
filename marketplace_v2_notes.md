# RCADE NFT Marketplace — V2 Protocol Upgrade Specifications

This document outlines high-integrity technical design patterns for the future **Marketplace V2 Upgrade** of the RCADE trading protocol. These specifications detail security patches, administrative caps, royalty payout protection models, and gas-efficient structural alternatives designed to preserve the absolute auditability and decentralization of the RCADE ecosystem.

---

## 1. Emergency Circuit Breaker (`Pausable`)

### Goal
Provide contract-level emergency freeze mechanics to protect player capital and asset vaults in the event of external token exploits or smart contract vulnerabilities.

### Design Pattern
Integrate OpenZeppelin's standard `Pausable` state tracking:
- Add a custom `paused` state controlled strictly by the `Owner` account.
- Decorate `executeSale()` and `createListing()` triggers with the `whenNotPaused` modifier.
- Maintain view-only functions (`validateListing`, `hashListing`) and cancellation triggers (`cancelListing`, `cancelAllListings`) as **unrestricted** even during a pause, ensuring players retain absolute control to void their off-chain signatures at any time.

```solidity
import "@openzeppelin/contracts/security/Pausable.sol";

contract RCADEMarketplaceV2 is RCADEMarketplace, Pausable {
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function executeSale(
        Listing calldata listing, 
        bytes calldata signature
    ) external payable override whenNotPaused nonReentrant {
        // Core execution...
    }
}
```

---

## 2. Hardcoded Treasury Fee Cap

### Goal
Prevent administrative abuse, malicious fee hikes, or private key compromise vectors by hardcoding a strict ceiling on the protocol's fee parameter.

### Design Pattern
Add an immutable, hardcoded fee cap to the state and enforce it within administrative setters:
- **Maximum Cap**: `1000` BPS (representing `10.0%` of transaction volume).
- **Enforcement**: Set a strict `require` statement inside `setFeeBps` to permanently prevent any treasury adjustments exceeding this ceiling.

```solidity
uint256 public constant MAX_FEE_BPS = 1000; // Hard Cap of 10%

function setMarketplaceFee(uint256 newFeeBps) external onlyOwner {
    require(newFeeBps <= MAX_FEE_BPS, "Fee exceeds strict 10% ceiling");
    marketplaceFeeBps = newFeeBps;
    emit MarketplaceFeeUpdated(newFeeBps);
}
```

---

## 3. Graceful Pull-Payment Royalty Payouts

### Goal
Mitigate Denial-of-Service (DoS) and reentrancy vectors where malicious creators or poorly written smart contract wallets configure their ERC2981 royalty address to revert on `payable.call` transfers, rendering their NFTs untradeable.

### Design Pattern
Transition from push-based royalty distribution to a secure **Pull-Payment (Withdrawal/Escrow) Model**:
- When `executeSale()` processes a trade:
  1. Retrieve creator royalty details via `IERC2981.royaltyInfo()`.
  2. Attempt a gas-capped, direct transfer to the creator address.
  3. If the direct transfer fails or reverts (returning `false`), **do not revert the entire trade**. 
  4. Instead, gracefully divert the royalty payout into a pending withdrawal mapping: `mapping(address => uint256) public pendingWithdrawals;`.
  5. The creator can subsequently claim their accumulated royalties securely on-demand via a dedicated `claimRoyalties()` call.

```solidity
// Inside executeSale:
if (royaltyAmount > 0) {
    (address receiver, ) = IERC2981(nftContract).royaltyInfo(listing.tokenId, price);
    
    // Attempt direct payout with strict gas limit to prevent loops
    (bool success, ) = payable(receiver).call{value: royaltyAmount, gas: 3000}("");
    
    if (!success) {
        // Fallback gracefully to Pull-Payment balance
        pendingWithdrawals[receiver] += royaltyAmount;
        emit RoyaltyDivertedToEscrow(receiver, listing.tokenId, royaltyAmount);
    } else {
        emit RoyaltyPaid(receiver, royaltyAmount);
    }
}
```

---

## 4. Zero-Approval Escrow Trade Architecture (Alternative)

### Goal
Eliminate the security hazard of requiring players to sign a global `setApprovalForAll(marketplace, true)` allowance on their progression NFT vault, restricting trades to isolated, escrow-backed positions.

### Design Pattern
Move from **Signature-based Off-chain Listings** to **Escrow-backed On-chain Listings**:
- **List Trigger**: Instead of signing off-chain EIP-712 messages, players call an on-chain `depositAndList()` transaction. This transfers the configured quantity of NFTs from their wallet into the Marketplace escrow vault.
- **Buy Trigger**: The buyer executes a sale by sending ETH directly to the contract. The contract distributes the ETH to the seller and atomically transfers the NFT out of the escrow vault to the buyer.
- **Cancel Trigger**: The seller calls `cancelAndWithdraw()` which returns the escrowed NFT back to their wallet, instantly deleting the listing.

### Comparison Matrix

| Attribute | Off-Chain Signed (Current V1) | Escrow-Backed (V2 Option) |
| :--- | :--- | :--- |
| **Gas Cost to List** | Zero Gas (Free off-chain signature) | Standard Gas (On-chain contract deposit) |
| **Approval Safety** | Requires global approval (High trust) | Zero approval required (Isolated trust) |
| **Double-Spending** | Handled by dynamic balance checks | Impossible (NFT is physically locked in escrow) |
| **UX Friction** | Instant listings; signs in wallet | Two transactions (Deposit; Claim) |
