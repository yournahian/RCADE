export interface GameCapabilities {
  ranked: boolean;
  replayViewer: boolean;
  wagering: boolean;
  deterministicSeed: boolean;
  multiplayer: boolean;
  mobileControls: boolean;
}

export interface GameConfig {
  gameId: number;
  title: string;
  description: string;
  icon: string; // Used to identify the lucide-react icon component
  accentColor: string; // Neon hex code for premium styling
  availableLevels: number;
  routeSlug: string;
  status: 'LIVE' | 'COMING_SOON';
  unlockTitles: string[]; // Progression level badge names
  capabilities: GameCapabilities;
}

export const GAMES: GameConfig[] = [
  {
    gameId: 1,
    title: 'Neon Snake',
    description: 'Navigate the cyber grid, consume energy data, and survive digital hazards inside the mainframe grid.',
    icon: 'Zap',
    accentColor: '#a9ddd3', // Mint glow
    availableLevels: 10,
    routeSlug: 'neon-snake',
    status: 'LIVE',
    unlockTitles: ['Bronze Grid Survivor', 'Silver Mainframe Cyber', 'Gold Network Master'],
    capabilities: {
      ranked: true,
      replayViewer: true,
      wagering: false,
      deterministicSeed: true,
      multiplayer: false,
      mobileControls: true
    }
  },
  {
    gameId: 2,
    title: 'Cyber Runner',
    description: 'Dash through high-speed hacker tunnels, hack security nodes, and escape the security scanner.',
    icon: 'Cpu',
    accentColor: '#22d3ee', // Cyan glow
    availableLevels: 10,
    routeSlug: 'cyber-runner',
    status: 'LIVE',
    unlockTitles: ['Bronze Tunnel Runner', 'Silver Network Glider', 'Gold Hack master'],
    capabilities: {
      ranked: false,
      replayViewer: false,
      wagering: false,
      deterministicSeed: false,
      multiplayer: false,
      mobileControls: true
    }
  },
  {
    gameId: 3,
    title: 'Void Arena',
    description: 'Engage in zero-gravity space combat against swarms of corrupted glitch drones.',
    icon: 'Layers',
    accentColor: '#a855f7', // Purple glow
    availableLevels: 0,
    routeSlug: 'void-arena',
    status: 'COMING_SOON',
    unlockTitles: ['Bronze Ship cadet', 'Silver Fleet Ace', 'Gold Star Voidmaster'],
    capabilities: {
      ranked: false,
      replayViewer: false,
      wagering: false,
      deterministicSeed: false,
      multiplayer: false,
      mobileControls: false
    }
  },
  {
    gameId: 4,
    title: 'Pixel Heist',
    description: 'Navigate stealth chambers, bypass laser grids, and secure high-value encrypted ledger data.',
    icon: 'Trophy',
    accentColor: '#22c55e', // Green glow
    availableLevels: 0,
    routeSlug: 'pixel-heist',
    status: 'COMING_SOON',
    unlockTitles: ['Bronze Lockbreaker', 'Silver Vault Phantom', 'Gold Secure Ledgermaster'],
    capabilities: {
      ranked: false,
      replayViewer: false,
      wagering: false,
      deterministicSeed: false,
      multiplayer: false,
      mobileControls: false
    }
  },
  {
    gameId: 5,
    title: 'Space Impact',
    description: 'Engage swarms of glitch spaceships, secure high-value energy shields, and survive epic galactic boss battles.',
    icon: 'Swords',
    accentColor: '#ec4899', // Cyan/Pink neon glow
    availableLevels: 10,
    routeSlug: 'space-impact',
    status: 'LIVE',
    unlockTitles: ['Bronze Space Pilot', 'Silver Fleet Commander', 'Gold Void Hunter'],
    capabilities: {
      ranked: true,
      replayViewer: true,
      wagering: false,
      deterministicSeed: true,
      multiplayer: false,
      mobileControls: true
    }
  },
  {
    gameId: 6,
    title: 'Sudoku Matrix',
    description: 'Solve deterministic matrix puzzles inside the mainframe under extreme cyberpunk time pressure.',
    icon: 'Grid',
    accentColor: '#fbbf24', // Cyber Amber glow
    availableLevels: 3,
    routeSlug: 'sudoku',
    status: 'LIVE',
    unlockTitles: ['Neon Rookie', 'Cyber Adept', 'Overlord Matrix'],
    capabilities: {
      ranked: true,
      replayViewer: true,
      wagering: false,
      deterministicSeed: true,
      multiplayer: false,
      mobileControls: true
    }
  }
];

export function getGameBySlug(slug: string): GameConfig | undefined {
  return GAMES.find(g => g.routeSlug === slug);
}

export function getGameById(id: number): GameConfig | undefined {
  return GAMES.find(g => g.gameId === id);
}
