export interface PlayerRankData {
  id: string;
  userId: string;
  gameId: number;
  trophies: number;
  peakTrophies: number;
  xp: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  winStreak: number;
  updatedAt: string;
  mmr?: number;
  isPlaced?: boolean;
  placementMatchesRemaining?: number;
}

export interface MatchPlayerDto {
  userId: string;
  username: string;
  score: number | null;
  status: string;
  submittedAt: string | null;
}

export interface MatchDto {
  id: string;
  gameId: number;
  mode: string;
  roomCode: string | null;
  status: string;
  winnerId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  players: MatchPlayerDto[];
}

export interface ActiveMatchStatusResponse {
  activeMatchId: string | null;
  activeRoom?: {
    id: string;
    roomCode: string;
    wagerAmount: string | null;
    creatorId: string;
    guestId: string | null;
    status: string;
  } | null;
  activeQueue?: {
    id: string;
    mode: string;
    gameId: number;
    wagerAmount: string | null;
    joinedAt: string;
  } | null;
  rank: PlayerRankData | null;
}


export interface UserDuelHistoryItem {
  matchId: string;
  opponent: string;
  outcome: 'VICTORY' | 'DEFEAT' | 'DRAW' | 'PENDING' | 'CANCELLED';
  myScore: number;
  oppScore: number;
  resolvedAt: string | null;
}

export interface LeaderboardRankItem {
  rank: number;
  username: string;
  trophies: number;
  winRate: string;
  matchesPlayed: number;
}

export interface GameplayEventSnapshot {
  t: number;      // Timestamp offset from start (milliseconds)
  e: string;
  x: number;      // Grid X-coordinate
  y: number;      // Grid Y-coordinate
  val?: number | string;
}

export interface ReplayTimelineData {
  matchId: string;
  userId: string;
  gameId: number;
  createdAt: number;
  events: GameplayEventSnapshot[];
}

export interface EntropyCheckpoint {
  sequenceId: number;
  timestamp: number;
  milestone: string;
  hash: string;
}

// UI State Lifecycle for client tracking aligned exactly with the authoritative FSM states
export type ArenaUiState = 
  | 'IDLE' 
  | 'LOBBY' 
  | 'QUEUED' 
  | 'MATCHED' 
  | 'COUNTDOWN' 
  | 'ACTIVE' 
  | 'SUBMITTED' 
  | 'VERIFIED' 
  | 'COMPLETED' 
  | 'CANCELLED' 
  | 'DISPUTED';
