/**
 * Formal inventory state enums.
 * Unifies asset representation across gameplay, dashboard, progression, and marketplace.
 * Future-proofs system for prospective staking, equipment loadouts, rentals, and crafting systems.
 */
export enum InventoryState {
  AVAILABLE = 'AVAILABLE', // Free to list, transfer, or use in gameplay gates
  RESERVED = 'RESERVED',   // Locked for system reasons (e.g. pending gameplay loops)
  LISTED = 'LISTED',       // Committed to an active off-chain marketplace listing
  SYNCING = 'SYNCING',     // Transitioning state (e.g. optimistic sync pending confirm)
  INVALID = 'INVALID'      // Mismatched or invalid state flagged by reconciliation checks
}
