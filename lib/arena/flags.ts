export interface ArenaFeatureFlags {
  ARENA_ENABLED: boolean;
  ARENA_BRONZE_ENABLED: boolean;
  ARENA_SILVER_ENABLED: boolean; // Hard-gated OFF for alpha
  ARENA_ELITE_ENABLED: boolean;  // Hard-gated OFF for alpha
  ARENA_RANKED_ENABLED: boolean;
  ARENA_WAGER_ENABLED: boolean;  // Hard-gated OFF for alpha
  ARENA_REPLAY_CAPTURE_ENABLED: boolean;
  ARENA_GHOST_SEEDER_ENABLED: boolean;
}

export const getArenaFlags = (): ArenaFeatureFlags => {
  // Read flags with safe alpha defaults
  const arenaEnabled = process.env.NEXT_PUBLIC_ARENA_ENABLED !== 'false';
  const bronzeEnabled = process.env.NEXT_PUBLIC_ARENA_BRONZE_ENABLED !== 'false';
  const rankedEnabled = process.env.NEXT_PUBLIC_ARENA_RANKED_ENABLED !== 'false';
  const replayCapture = process.env.NEXT_PUBLIC_ARENA_REPLAY_CAPTURE_ENABLED !== 'false';
  const ghostSeeder = process.env.NEXT_PUBLIC_ARENA_GHOST_SEEDER_ENABLED !== 'false';

  return {
    ARENA_ENABLED: arenaEnabled,
    ARENA_BRONZE_ENABLED: bronzeEnabled,
    ARENA_SILVER_ENABLED: false, // Force disabled for Alpha
    ARENA_ELITE_ENABLED: false,  // Force disabled for Alpha
    ARENA_RANKED_ENABLED: rankedEnabled,
    ARENA_WAGER_ENABLED: false,  // Force disabled for Alpha
    ARENA_REPLAY_CAPTURE_ENABLED: replayCapture,
    ARENA_GHOST_SEEDER_ENABLED: ghostSeeder,
  };
};
