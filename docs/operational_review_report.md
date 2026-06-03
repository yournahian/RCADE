# RCADE System Operational Review Report

This report presents a comprehensive technical review of the **RCADE** platform's core mechanics, covering the Play Section, EIP-1155 NFT Minting, Sequential Progression Gating, Arena Custom Mode, and Privy Wallet Integration.

---

## 1. Play Section Core Mechanics
The play section integrates Next.js dynamic routing with a client-side Phaser game engine wrapper, governed by server-side session checks.

### Key Workflows & Invariants:
*   **Cabinet Navigation & Config**: [games.ts](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/lib/games.ts) manages the registry of cabinets. Currently, three games are marked `LIVE` (Neon Snake, Space Impact, and Sudoku Matrix). Other cabinets (Cyber Runner, Void Arena, Pixel Heist) return a compilation placeholder view.
*   **Session Initialization**: Before launching a game, the client sends a request to [/api/session/create](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/app/api/session/create/route.ts). The server verifies if the user is authorized to play the requested level (`requestedLevel <= progressionLevel + 1`). If authorized, it creates a `GameSession` in the `ACTIVE` status.
*   **Save Run & Completion**: On clear, the Phaser client emits a `save-run` event. The page calls [/api/session/complete](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/app/api/session/complete/route.ts) with the score, duration, and telemetry inputs. The server marks the session `COMPLETED`, records a `GameRun` and a `LevelProgress` entry, and updates user high score aggregates.
*   **Anti-Cheat Safeguards**: During session completion, the server checks for:
    1.  *Duration anomaly*: The duration of the run cannot exceed the actual elapsed time between session creation and completion plus a 60-second buffer.
    2.  *Impossible score rate*: Ratios exceeding 500 points per second (at score > 1000) are flagged.
    Violations invalidate the session and append details to `anticheat-debug.log`.

---

## 2. EIP-1155 NFT Minting Lifecycle
The platform uses gasless, sponsored EIP-1155 minting on Base Sepolia to bridge gameplay outcomes with on-chain items.

### Minting Steps:
1.  **Prepared Reward**: Reaching a level's score target generates a `Reward` entry in the database with `claimStatus: 'PREPARED'` via [reward.ts](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/services/reward.ts).
2.  **Signature Generation**: Clicking "Mint" calls [/api/rewards/mint-payload](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/app/api/rewards/mint-payload/route.ts), which constructs:
    *   A **deterministic tokenId** using bitwise packing:
        `[16b reserved][16b gameId][16b season][16b category][16b level][8b rarity][reserved]`
    *   An **EIP-712 typed signature** signed by the server's `MINTER_PRIVATE_KEY` authorizer.
3.  **On-Chain Mint**: The frontend uses Privy's wallet provider to call `mint(to, tokenId, amount, rewardId, signature)` on the deployed `RCADE_ERC1155` contract.
4.  **Verification**: After transaction completion, the client triggers [/api/rewards/mint-success](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/app/api/rewards/mint-success/route.ts) which queries the transaction receipt using viem's `publicClient.getTransactionReceipt` and marks the reward as `MINTED`.
5.  **Indexing & Self-Healing**:
    *   `services/indexer.ts` scans the blockchain for `TransferSingle` events, writing new token counts to the `NFTOwnership` table and recalculating user progression.
    *   `services/reconciliation.ts` executes a periodic background reconciliation process every 120 seconds. It reads the blockchain state (`balanceOf`) directly and syncs the database if any discrepancy is found.

---

## 3. Sequential Web3 Progression Gating
The progression system links real-time gaming permissions with blockchain state.

### Design Details:
*   **Contiguous Chains**: Progression levels are calculated by compiling a user's *usable inventory* (owned amount minus listed/reserved marketplace amount). The engine checks for a contiguous sequence starting from Level 1:
    `while (ownedLevels.has(effectiveProgression + 1)) effectiveProgression++;`
*   **Broken Chains**: If a user transfers an intermediate NFT (e.g. they own Levels 1, 2, 3, and 5 but transfer Level 2), the chain breaks, and their effective progression level immediately collapses to 1.
*   **Gated Access**: When a user clears a level, they can only play the next level after minting the corresponding NFT reward. This creates a hard loop enforcing Web3 asset ownership.
*   **Marketplace Reservation**: Listings marked `ACTIVE` on the marketplace are excluded from usable inventory by the centralized inventory resolver. Listing a core progression NFT causes progression downgrades until the listing is bought or cancelled.

---

## 4. Arena Custom Mode (Private Rooms)
Arena's custom mode allows players to challenge peers directly in private lobbies without affecting their ranked Glicko-2 ratings.

### Technical Flow:
*   **Room Creation & Code Generation**: Host calls `/api/arena/room` (POST) to invoke [RoomService.ts](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/services/arena/RoomService.ts). This generates a unique 6-character room code (using a filtered character set: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` to prevent confusion) and sets status to `LOBBY`.
*   **Room Pairing**: A guest enters the code to join via `/api/arena/room` (PUT), updating status to `READY`.
*   **Match Launch**: The host launches the match via `/api/arena/room` (PATCH), producing an `ArenaMatch` database record with `mode: 'CUSTOM'` and status `ACTIVE`.
*   **Wager Escrow**: If a wager is attached, [EscrowService.ts](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/services/arena/EscrowService.ts) holds the stakes on-chain, deducting a 10% custom platform fee.
*   **Real-time Synchronization (SSE)**: Lobbies and match states are synced via a Server-Sent Events (SSE) stream endpoint ([/api/arena/realtime](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/app/api/arena/realtime/route.ts)) mapped to user-specific and room-specific topics.
*   **Watchdog Recovery**:
    *   *Match Watchdog*: If a player disconnects from the SSE stream for more than 5 seconds in an active match, they forfeit. The match settles in favor of the opponent.
    *   *Lobby Watchdog*: If a player disconnects from the SSE stream for more than 8 seconds while in a custom lobby, the room is automatically cleaned up or reset to `LOBBY` status.
*   **Anti-Cheat / Anti-Farming**: The PvP engine auditing system ([ArenaService.ts](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/services/arena/ArenaService.ts)) checks for:
    *   *Repeated Instant Losses*: Score 0 in <5 seconds.
    *   *Suspicious Farming*: Matchups against the same opponent consecutively more than 3 times.
    Both trigger an `AntiFraudFlag` database entry.

---

## 5. Privy Wallet Connection
Authentication and identity verification are managed through Privy hooks and API claims.

### Security Architecture:
*   **Provider Config**: [PrivyProviderWrapper.tsx](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/components/providers/PrivyProviderWrapper.tsx) configures the Privy SDK to use Base Sepolia as the default chain, auto-generating embedded wallets on login for social and email authentication.
*   **Backend JWT Validation**: API endpoints use the Privy Server SDK to verify the token sent in the `Authorization: Bearer <token>` header, ensuring secure mapping of actions to Privy DIDs (`userId`).
*   **Database Synchronization**: The [/api/auth/sync](file:///c:/Users/user/Documents/VsCode/Next.js/PlayGround/RCADE/app/api/auth/sync/route.ts) route ensures that the user's Privy DID is correctly linked with their public wallet address and database record, recalculating progression states on load.
*   **Automatic Chain Switching**: Before conducting contract writes (minting, transfers, listings), the frontend queries the current chain via Privy's `useWallets()` hook and prompts a switch to Base Sepolia (chain ID 84532) if mismatching.
