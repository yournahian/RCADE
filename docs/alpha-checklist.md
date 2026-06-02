# Closed Alpha Operational Readiness Checklist

This document details the checklist and verification procedures for the **RCADE Closed Alpha Stabilization & Hardening** release.

---

## 1. Centralized Inventory Resolver Checks
- [ ] **Canonical Single Source Verification**
  - Verify that `services/inventory.ts` is the *only* module performing raw ownership database scans and calculating item balances.
  - No active listings should ever be included as usable balance. Available balance must exactly represent `owned amount - listed amount`.
- [ ] **Progression Level Recalculations**
  - Trigger listing actions on the client and verify in developer logs that the player's contiguous progression levels recalculate immediately.
  - Trigger cancel actions and verify that the progression state heals instantly to reflect the freed NFT.
  - Verify that purchase executions safely deduct from the seller's progression and add to the buyer's contiguous level immediately after sync execution.
- [ ] **Overlisting Protection**
  - Attempt to list more than the user's *available* NFT balance (e.g. if the user owns 2 tokens, lists 1, and attempts to list another 2).
  - Verify that the overlisting gate inside `/api/marketplace/list` rejects the signature request with status code `400` and message `Insufficient available balance`.

---

## 2. Refresh Queue & RPC Storm Mitigation
- [ ] **Sync Queue Debouncing**
  - Open developer console, click the sync refresh button rapidly 5-10 times consecutively.
  - Verify that the RPC does *not* receive 5-10 separate requests in parallel. Instead, all concurrent clicks must collapse safely into exactly **one active promise cycle** and **one pending cycle**, resulting in exactly 2 sequential executions maximum.
- [ ] **Concurrent State Loading Checks**
  - Rapidly list, buy, or cancel an asset and check if the refresh indicators remain stable, debouncing all incoming indexer scans.

---

## 3. Unified Player Hub Dashboard
- [ ] **Six Subtab Views Checklist**
  - **Active Listings**: Grid showing active sale prices, expirations, and cancellation buttons.
  - **Sales History**: Timestamps, buyers, prices in ETH, and direct clickable Base Sepolia explorer icons.
  - **Purchase History**: Timestamps, sellers, prices in ETH, and explorer links.
  - **Reward Vault**: Prepared pending rewards ready for minting. Displays level metadata, completion ranks, and high-contrast glowing "MINT NFT REWARD" buttons.
  - **Progression Status**: Retro CRT stat grid showcasing high scores, combos, effective contiguous levels, and an active level timeline visualization.
  - **Reserved NFTs**: Dedicated locking lists displaying assets committed to active listings, demonstrating exactly why they are currently gated from gameplay.
- [ ] **Mobile-Safe Responsiveness**
  - Use Chrome DevTools Device Emulator to verify scaling down to `320px` (iPhone SE).
  - Ensure the subtabs nav bar supports horizontal touch scroll with zero text cropping or container overflows.
  - Check that table views stack or hide non-critical columns gracefully on smaller viewports.

---

## 4. Failure Recovery & Error Boundary
- [ ] **ErrorBoundary Fallback Integrity**
  - Temporarily inject a rendering throw (e.g. `throw new Error("Hydration crashed")`) in a dashboard subview.
  - Confirm the page does *not* blank out. It must display the sleek glowing amber **SYSTEM CRASH GATED** console terminal with full stack diagnostics and the "Reboot System" retry workflow.
- [ ] **Optimistic State Rollbacks**
  - Trigger listing creations and ensure listings render optimistically as `[SYNCING...]`.
  - Simulate a wallet rejection or transaction failure, and verify that the local client list reverts back to its pre-transaction state without leaving ghost entries.

---

## 5. Telemetry & Analytics Diagnostic Checks
- [ ] **Telemetry Event Assertions**
  - Open console and verify that internal tracking triggers console dispatches for:
    - `LISTING_CREATED`
    - `PURCHASE_COMPLETED`
    - `TRANSACTION_FAILED`
    - `PROGRESSION_CHANGED`
    - `WALLET_MISMATCH_DETECTED`
  - Ensure zero third-party telemetry calls (e.g. Mixpanel, Google Analytics) are active, keeping player logs lightweight and completely local.
