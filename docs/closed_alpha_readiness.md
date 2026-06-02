# Closed Alpha Operational Readiness Runbook

This document is the definitive operational runbook and sanity-check manifest for deploying and stabilizing the **RCADE** platform for real-user Closed Alpha playtesting.

---

## 1. Pre-Deployment Environment Validation

Before launching the Closed Alpha environment on Base Sepolia, ensure the following environment variables are correctly injected and validated in the production hosting container (e.g., Vercel, Railway, or AWS).

### Mandatory Variables Checklist
- [ ] **`DATABASE_URL`**: High-availability PostgreSQL connection string. Must target a pooled database endpoint (e.g., PgBouncer) for production scaling.
- [ ] **`NEXT_PUBLIC_PRIVY_APP_ID`**: Valid client app ID from the Privy developer console.
- [ ] **`PRIVY_APP_SECRET`**: Secure backend API secret matching the above Privy App ID.
- [ ] **`NEXT_PUBLIC_RPC_URL`**: HTTPS RPC endpoint for Base Sepolia (e.g., Alchemy, Infura, or QuickNode).
- [ ] **`NEXT_PUBLIC_WSS_RPC_URL`**: WebSocket RPC endpoint for transaction event listening and indexed log syncs.
- [ ] **`NEXT_PUBLIC_CONTRACT_ADDRESS`**: Address of the deployed `RCADE_ERC1155` game assets smart contract on Base Sepolia.
- [ ] **`NEXT_PUBLIC_MARKETPLACE_ADDRESS`**: Address of the `RCADEMarketplace` smart contract.

> [!WARNING]
> **API Secrets Safeguard**
> Never commit any `.env.local` or `.env` files to git. Rotate Privy app secrets immediately if any public repository push or log leakage is suspected.

---

## 2. RPC Failover & WS Reconnect Configuration

Base Sepolia public nodes occasionally suffer from high latency, stale block headers, or outright socket disconnects. The RCADE engine utilizes a resilient dual-mode watcher (`WEBSOCKET` with active fallback to `POLLING`).

### Failover Tuning Parameters

If public WebSockets disconnect frequently:
1. **Reduce Reconnect Thresholds**: In the listener configuration, adjust retry parameters to debounce connection requests.
2. **Switch to Third-Party RPC**: Replace public endpoints with dedicated API endpoints:
   - **Alchemy**: `https://base-sepolia.g.alchemy.com/v2/YOUR-API-KEY`
   - **QuickNode**: `https://your-node.base-sepolia.discover.quiknode.pro/YOUR-KEY`
3. **Graceful Fallback Mode**: If WebSocket errors persist beyond **5 consecutive retries** within **60 seconds**, the dashboard automatically shifts to standard HTTP **Chunked Polling** (`getLogs` batches of `100` blocks) to prevent gameplay desynchronization.

---

## 3. Database Reconciliation & Sanity Queries

Admins can execute these Prisma or raw SQL queries to audit the platform state, resolve level progression mismatches, find missing listing balances, or clear double claims.

### Audit 1: Find Players with Level Gaps / Progression Mismatches
This query finds users whose database `effectiveProgressionLevel` does not match the actual contiguous calculation of their active on-chain `NFTOwnership` inventory.

#### Prisma Client Script
```typescript
import { prisma } from '@/lib/prisma';
import { calculateEffectiveProgression } from '@/lib/inventory-resolver';

async function auditUserProgression(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { rewards: true }
  });
  
  if (!user || !user.wallet) return;

  const nftBalances = await prisma.nFTOwnership.findMany({
    where: { wallet: user.wallet, isActive: true }
  });

  // Calculate local contiguous sequence level
  const ownedLevels = new Set(nftBalances.map(nft => parseInt(nft.tokenId))); // tokenIds map to levels
  let calculatedEffective = 0;
  while (ownedLevels.has(calculatedEffective + 1)) {
    calculatedEffective++;
  }

  if (user.effectiveProgressionLevel !== calculatedEffective) {
    console.warn(`[AUDIT MISMATCH] User: ${user.id} | DB Level: ${user.effectiveProgressionLevel} | Actual NFT Level: ${calculatedEffective}`);
    
    // Repair trigger
    await prisma.user.update({
      where: { id: user.id },
      data: { effectiveProgressionLevel: calculatedEffective }
    });
    console.info(`[AUDIT REPAIRED] Set user ${user.id} effective progression to ${calculatedEffective}`);
  }
}
```

#### Raw SQL Query (PostgreSQL)
```sql
-- Identify users with out-of-sync levels
SELECT 
  u.id as user_id, 
  u.wallet,
  u."effectiveProgressionLevel" as db_progression_level,
  COALESCE(
    (
      -- Calculate max contiguous level based on owned active NFT ownerships
      WITH RECURSIVE contiguous_levels AS (
        SELECT 1 AS lvl
        WHERE EXISTS (SELECT 1 FROM "NFTOwnership" n WHERE n.wallet = u.wallet AND n."tokenId" = '1' AND n."isActive" = true)
        
        UNION ALL
        
        SELECT cl.lvl + 1
        FROM contiguous_levels cl
        WHERE EXISTS (
          SELECT 1 FROM "NFTOwnership" n 
          WHERE n.wallet = u.wallet 
            AND n."tokenId" = CAST(cl.lvl + 1 AS VARCHAR) 
            AND n."isActive" = true
        )
      )
      SELECT MAX(lvl) FROM contiguous_levels
    ), 0
  ) as actual_nft_level
FROM "User" u
WHERE u.wallet IS NOT NULL
  AND u."effectiveProgressionLevel" <> COALESCE(
    (
      WITH RECURSIVE contiguous_levels AS (
        SELECT 1 AS lvl
        WHERE EXISTS (SELECT 1 FROM "NFTOwnership" n WHERE n.wallet = u.wallet AND n."tokenId" = '1' AND n."isActive" = true)
        
        UNION ALL
        
        SELECT cl.lvl + 1
        FROM contiguous_levels cl
        WHERE EXISTS (
          SELECT 1 FROM "NFTOwnership" n 
          WHERE n.wallet = u.wallet 
            AND n."tokenId" = CAST(cl.lvl + 1 AS VARCHAR) 
            AND n."isActive" = true
        )
      )
      SELECT MAX(lvl) FROM contiguous_levels
    ), 0
  );
```

### Audit 2: Validate Available vs Listed NFT Balances
Ensure that no marketplace listings allow over-committed balances (which could lead to double-spending or broken sales).

```sql
-- Find token balances where listed quantity exceeds owned active quantity
SELECT 
  n.wallet, 
  n."tokenId", 
  n.amount as owned_amount,
  COALESCE(SUM(l.amount), 0) as listed_amount
FROM "NFTOwnership" n
LEFT JOIN "MarketplaceListing" l ON l.seller = n.wallet 
  AND l."tokenId" = n."tokenId" 
  AND l.status = 'ACTIVE'
WHERE n."isActive" = true
GROUP BY n.wallet, n."tokenId", n.amount
HAVING COALESCE(SUM(l.amount), 0) > n.amount;
```

---

## 4. Manual QA Validation Matrix

To verify that the entire platform is healthy and ready for human Closed Alpha playtesting, run the following end-to-end player journey sequence:

| Step | Action | Expected Behavior | Verification Point |
| :--- | :--- | :--- | :--- |
| **1** | Privy Authentication | User registers/logs in via Privy (Social or Email). An embedded wallet is generated instantly. | Profile header displays active wallet address. |
| **2** | Fresh Inventory Sync | System runs indexer fetch. Wallet has zero NFTs, so level displays `1` (progression `0`). | Progress map shows Level 1 pulsing in **green (TARGET)**, all other nodes locked. |
| **3** | Play Level 1 | Launch Neon Snake, complete Level 1 objectives with a score higher than `1000`. | Game run is saved in database; game logs show score receipt. |
| **4** | Generate Reward | Backend evaluates run safety. Vault transitions to show a `PREPARED` Level 1 reward item. | Reward Vault tab displays glowing **MINT NFT REWARD** button. |
| **5** | sponsored Mint | Click Mint. Smart contract wallet initiates gasless sponsored minting transaction. | Transaction completes on Base Sepolia. Status updates to `MINTED`. |
| **6** | Progression Shift | Level 1 NFT is indexed. Effective level transitions: `0` ➔ `1`. | Dashboard level rises. Level 1 node glows **orange (ACTIVE)**; Level 2 pulses in **green (TARGET)**. |
| **7** | Create Listing | List Level 1 NFT for `0.005 ETH` on the Marketplace. | Listing hash is created. Token is marked **RESERVED** (excluded from progression). |
| **8** | Progression Lock | Progression recalculates since Level 1 NFT is now reserved. | Active progression level drops back to `0`. Level 1 node returns to **green (TARGET)**. |
| **9** | Cancel Listing | Cancel the marketplace listing. | Listing status transitions to `CANCELLED`. NFT returns to active wallet inventory. |
| **10** | Progression Recovery | Progression instantly restores now that the Level 1 NFT is no longer reserved. | Active progression level rises back to `1`. |
| **11** | peer-to-peer Transfer | Transfer Level 1 NFT to an external wallet address. | Transaction indexer fires. Current user's NFT amount decreases to `0`. |
| **12** | Progression Loss | Contiguous chain is now broken (Level 1 count is `0`). | Progression drops to `0`. Level 1 node shifts back to **green (TARGET)**. |

---

## 5. Emergency Rollback Procedures

If an indexer desynchronization event or smart contract upgrade occurs, follow these recovery pipelines to clean states.

### Action A: Force Synchronize User Inventory
If a user complains that their in-game state does not match their actual on-chain wallet tokens, execute a manual state sync through the QA console or via REST request:

```bash
# Force a backend on-chain recount and state recalculation
curl -X POST \
  -H "Authorization: Bearer <USER_ACCESS_TOKEN>" \
  https://rcade.game/api/auth/sync
```

### Action B: Reset Failed Indexer Event Blocks
If the block indexer missed some events due to RPC server downtime, restart indexing from a safe historical checkpoint:

1. Connect to the production database console.
2. Delete the indexed event history for the affected range to allow reprocessing:
   ```sql
   -- Clear processed blocks from the checkpoint onward to force re-indexing
   DELETE FROM "IndexedEvent" WHERE "blockNumber" >= 12345678;
   ```
3. Restart the background Next.js worker or hot-reload the deployment. The event listener will recalculate starting from block `12345678` upward.

---

*This document was approved for the RCADE Closed Alpha playtest by the Core Architecture Group.*
