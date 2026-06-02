import { useState, useEffect, useRef, useCallback } from 'react';
import { ArenaUiState, MatchDto, PlayerRankData, UserDuelHistoryItem, LeaderboardRankItem } from '@/types/arena/arena.types';
import { ArenaClientApi } from '@/services/arena-client/arenaApi';
import { EventBus } from '@/game/EventBus';
import { usePrivy } from '@privy-io/react-auth';

export function useArenaMatch(
  gameId: number = 1,
  arenaTier: 'BRONZE' = 'BRONZE',
  getAccessToken: () => Promise<string | null>,
  matchId?: string
) {
  const { authenticated } = usePrivy();
  const getAccessTokenRef = useRef(getAccessToken);
  useEffect(() => {
    getAccessTokenRef.current = getAccessToken;
  }, [getAccessToken]);
  // --- Standard States ---
  const [uiState, setUiState] = useState<ArenaUiState>('IDLE');
  const [activeMatch, setActiveMatch] = useState<MatchDto | null>(null);
  const [playerRank, setPlayerRank] = useState<PlayerRankData | null>(null);
  const [matchHistory, setMatchHistory] = useState<UserDuelHistoryItem[]>([]);
  const [standings, setStandings] = useState<LeaderboardRankItem[]>([]);
  
  // --- Matchmaking & Room States ---
  const [queueTimeElapsed, setQueueTimeElapsed] = useState<number>(0);
  const [queueActivity, setQueueActivity] = useState<{ activeQueuers: number; activeMatches: number }>({ activeQueuers: 0, activeMatches: 0 });
  const [customRoom, setCustomRoom] = useState<{ id: string; roomCode: string; wagerAmount: string | null; guestId?: string; status?: string; creatorId?: string } | null>(null);

  // --- Recovery / Connection States ---
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [sessionRecovered, setSessionRecovered] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeClientSalt, setActiveClientSalt] = useState<string | null>(null);
  const [activeSessionSeed, setActiveSessionSeed] = useState<string | null>(null);

  // --- Multi-Tab Authority Lock ---
  const [tabAuthority, setTabAuthority] = useState<'CONTROLLER' | 'OBSERVER'>('CONTROLLER');
  const [showClaimButton, setShowClaimButton] = useState<boolean>(false);
  const tabIdRef = useRef<string>('');
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- Timer States ---
  const [sessionTimeRemaining, setSessionTimeRemaining] = useState<number>(600); // 10 minutes max clock (in seconds)

  // --- Rematch Request State ---
  const [rematchRequest, setRematchRequest] = useState<{ senderId: string; senderUsername: string; matchId: string; roomCode: string } | null>(null);
  const [rematchDeclined, setRematchDeclined] = useState<{ senderId: string; senderUsername: string } | null>(null);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [rematchAccepted, setRematchAccepted] = useState<{ matchId: string; roomCode: string; gameId: number } | null>(null);
  const [opponentLeft, setOpponentLeft] = useState<{ senderId: string; senderUsername: string } | null>(null);

  const queueTimerRef = useRef<NodeJS.Timeout | null>(null);
  const matchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Clean-up helper to destroy intervals and timers
  const cleanupAllServices = useCallback(() => {
    console.log('[Arena][Cleanup] Performing cleanups of timers.');
    if (queueTimerRef.current) { clearInterval(queueTimerRef.current); queueTimerRef.current = null; }
    if (matchTimerRef.current) { clearInterval(matchTimerRef.current); matchTimerRef.current = null; }
    if (recoveryTimeoutRef.current) { clearTimeout(recoveryTimeoutRef.current); recoveryTimeoutRef.current = null; }
    if (heartbeatIntervalRef.current) { clearInterval(heartbeatIntervalRef.current); heartbeatIntervalRef.current = null; }
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.close();
      } catch {}
      broadcastChannelRef.current = null;
    }
  }, []);

  // BroadcastChannel Multi-Tab Control Lock
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!tabIdRef.current) {
      tabIdRef.current = 'tab_' + Math.random().toString(36).substring(2, 11);
    }

    const channelName = 'rcade_arena_authority';
    const bc = new BroadcastChannel(channelName);
    broadcastChannelRef.current = bc;

    bc.onmessage = (event) => {
      const { type, senderTabId } = event.data || {};
      if (senderTabId === tabIdRef.current) return;

      if (type === 'REQUEST_AUTHORITY') {
        if (tabAuthority === 'CONTROLLER') {
          bc.postMessage({ type: 'I_AM_CONTROLLER', senderTabId: tabIdRef.current });
        }
      } else if (type === 'I_AM_CONTROLLER') {
        setTabAuthority('OBSERVER');
        setShowClaimButton(false);
      } else if (type === 'CLAIM_AUTHORITY') {
        setTabAuthority('OBSERVER');
        setShowClaimButton(false);
      }
    };

    bc.postMessage({ type: 'REQUEST_AUTHORITY', senderTabId: tabIdRef.current });

    return () => {
      bc.close();
      broadcastChannelRef.current = null;
    };
  }, [tabAuthority]);

  // LocalStorage Heartbeat Fallback
  useEffect(() => {
    if (uiState !== 'ACTIVE') {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }

    if (tabAuthority === 'CONTROLLER') {
      localStorage.setItem(
        'rcade_authority_heartbeat',
        JSON.stringify({ tabId: tabIdRef.current, timestamp: Date.now() })
      );
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (tabAuthority === 'CONTROLLER') {
        localStorage.setItem(
          'rcade_authority_heartbeat',
          JSON.stringify({ tabId: tabIdRef.current, timestamp: Date.now() })
        );
      } else {
        const dataStr = localStorage.getItem('rcade_authority_heartbeat');
        if (dataStr) {
          try {
            const data = JSON.parse(dataStr);
            const age = Date.now() - data.timestamp;
            if (age >= 2000) {
              setShowClaimButton(true);
            } else {
              setShowClaimButton(false);
            }
          } catch (e) {
            setShowClaimButton(true);
          }
        } else {
          setShowClaimButton(true);
        }
      }
    }, 1000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [uiState, tabAuthority]);

  const claimPlayAuthority = useCallback(() => {
    console.log('[Arena][Authority] Tab claiming play authority.');
    if (broadcastChannelRef.current) {
      broadcastChannelRef.current.postMessage({
        type: 'CLAIM_AUTHORITY',
        senderTabId: tabIdRef.current
      });
    }
    setTabAuthority('CONTROLLER');
    setShowClaimButton(false);
    localStorage.setItem(
      'rcade_authority_heartbeat',
      JSON.stringify({ tabId: tabIdRef.current, timestamp: Date.now() })
    );
  }, []);

  // Fetch rankings and history
  const fetchHistoryAndStandings = useCallback(async () => {
    try {
      const [historyData, standingsData] = await Promise.all([
        ArenaClientApi.fetchDuelHistory(getAccessToken),
        ArenaClientApi.fetchStandings(gameId, arenaTier, getAccessToken)
      ]);
      setMatchHistory(historyData.history);
      setStandings(standingsData.leaderboard);
    } catch (err) {
      console.warn('[Arena][API] Non-blocking standings fetch failed:', err);
    }
  }, [gameId, arenaTier, getAccessToken]);

  const fetchHistoryAndStandingsRef = useRef(fetchHistoryAndStandings);
  useEffect(() => {
    fetchHistoryAndStandingsRef.current = fetchHistoryAndStandings;
  }, [fetchHistoryAndStandings]);

  // SSE Stream Listener for realtime updates (matchmaking, queue updates, private rooms)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let sse: EventSource | null = null;
    let active = true;
    let reconnectTimeout: any = null;

    const initSse = async () => {
      try {
        const token = await getAccessTokenRef.current();
        if (!token) {
          console.warn('[Realtime][SSE] Access token not ready. Retrying connection in 1.5s...');
          if (active) {
            reconnectTimeout = setTimeout(initSse, 1500);
          }
          return;
        }
        if (!active) return;

        sse = new EventSource(`/api/arena/realtime?token=${encodeURIComponent(token)}`);

        sse.onmessage = (event) => {
          try {
            const packet = JSON.parse(event.data);
            const { event: evName, data } = packet;

            if (evName === 'CONNECTED') {
              console.log('[ARENA_CLIENT] Connected to SSE stream.');
            } else if (evName === 'QUEUE_ACTIVITY') {
              setQueueActivity(data);
            } else if (evName === 'ROOM_JOIN') {
              console.log('[Realtime][SSE] Room join status:', data);
              if (data.status === 'CANCELLED') {
                setCustomRoom(null);
                setUiState('IDLE');
              } else {
                setCustomRoom(prev => {
                  if (prev) {
                    return {
                      ...prev,
                      guestId: data.guestId, // Allow resetting back to null when guest leaves
                      status: data.status || prev.status,
                      creatorId: data.creatorId || prev.creatorId
                    };
                  } else {
                    return {
                      id: data.id || `room_${data.roomCode}`,
                      roomCode: data.roomCode,
                      wagerAmount: data.wagerAmount || null,
                      creatorId: data.creatorId || '',
                      guestId: data.guestId || null,
                      status: data.status || 'LOBBY'
                    };
                  }
                });
                setUiState('LOBBY');
              }
            } else if (evName === 'REMATCH_REQUEST') {
              console.log('[ARENA_CLIENT] REMATCH_REQUEST received via SSE:', data);
              setRematchRequest(data);
            } else if (evName === 'REMATCH_DECLINED') {
              console.log('[ARENA_CLIENT] REMATCH_DECLINED received via SSE:', data);
              setRematchDeclined(data);
            } else if (evName === 'REMATCH_ACCEPTED') {
              console.log('[ARENA_CLIENT] REMATCH_ACCEPTED received via SSE:', data);
              setRematchAccepted({
                matchId: data.matchId,
                roomCode: data.roomCode,
                gameId: gameId
              });
            } else if (evName === 'REMATCH_START') {
              console.log('[ARENA_CLIENT] REMATCH_START received via SSE:', data);
              if (typeof window !== 'undefined') {
                (window as any).isEnteringRematch = true;
              }
              window.location.href = `/arena/match/${data.matchId}?gameId=${data.gameId || gameId}`;
            } else if (evName === 'OPPONENT_LEFT') {
              console.log('[ARENA_CLIENT] OPPONENT_LEFT received via SSE:', data);
              setOpponentLeft(data);
            } else if (evName === 'MATCH_COMPLETED') {
              console.log('[ARENA_CLIENT] MATCH_COMPLETED received via SSE:', data);
              setUiState('COMPLETED');
              localStorage.removeItem('rcade_active_match_id');
              localStorage.removeItem('rcade_active_session_id');
              console.log('[ARENA_CLIENT] Emitting match-completed via global EventBus:', data);
              EventBus.emit('match-completed', data);
              fetchHistoryAndStandingsRef.current();
            } else if (evName === 'MATCH_UPDATE') {
              console.log('[ARENA_CLIENT] MATCH_UPDATE received via SSE. Status:', data.status, data);
              setActiveMatch(data.matchData);
              if (data.status === 'MATCHED') {
                setUiState('MATCHED');
                localStorage.setItem('rcade_active_match_id', data.matchId);
              } else if (data.status === 'COUNTDOWN') {
                setUiState('COUNTDOWN');
              } else if (data.status === 'ACTIVE') {
                setUiState('ACTIVE');
                localStorage.setItem('rcade_active_match_id', data.matchId);
              } else if (data.status === 'COMPLETED') {
                console.log('[ARENA_CLIENT] MATCH_UPDATE COMPLETED status detected via SSE:', data);
                setUiState('COMPLETED');
                localStorage.removeItem('rcade_active_match_id');
                localStorage.removeItem('rcade_active_session_id');
                const compPayload = {
                  matchId: data.matchId,
                  winnerId: data.matchData?.winnerId,
                  loserId: data.matchData?.winnerId === data.matchData?.player1Id ? data.matchData?.player2Id : data.matchData?.player1Id,
                  reason: 'MATCH_UPDATE',
                  completedAt: data.matchData?.resolvedAt || new Date().toISOString()
                };
                console.log('[ARENA_CLIENT] Emitting match-completed via global EventBus (from MATCH_UPDATE):', compPayload);
                EventBus.emit('match-completed', compPayload);
                fetchHistoryAndStandingsRef.current();
              } else if (data.status === 'CANCELLED') {
                setUiState('CANCELLED');
                localStorage.removeItem('rcade_active_match_id');
                localStorage.removeItem('rcade_active_session_id');
                fetchHistoryAndStandingsRef.current();
              } else if (data.status === 'DISPUTED') {
                setUiState('DISPUTED');
              }
            }
          } catch (e) {
            console.error('[Realtime][SSE] Error parsing SSE payload:', e);
          }
        };

        sse.onerror = () => {
          console.warn('[Realtime][SSE] Stream error, scheduling reconnect...');
          sse?.close();
          if (active) {
            reconnectTimeout = setTimeout(initSse, 3000); // Re-establish stream in 3 seconds
          }
        };

      } catch (err) {
        console.error('[Realtime][SSE] Stream setup failed:', err);
      }
    };

    initSse();

    return () => {
      active = false;
      if (sse) {
        sse.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [gameId, authenticated]);

  // Authoritative State Sync (Backend is always the source of truth)
  const syncWithBackend = useCallback(async () => {
    // Verify token availability to prevent race conditions during Privy init
    const token = await getAccessToken();
    if (!token) {
      throw new Error('Privy access token is not ready yet');
    }

    try {
      const status = await ArenaClientApi.fetchStatus(gameId, getAccessToken);
      setPlayerRank(status.rank);
      if (status.rank?.userId) {
        localStorage.setItem('rcade_user_id', status.rank.userId);
      }

      // Recover active custom room lobbies if user is in one
      if (status.activeRoom) {
        console.log('[Arena][Sync] Restoring active custom room lobby:', status.activeRoom);
        setCustomRoom(status.activeRoom);
        setUiState('LOBBY');
      }

      // Recover active matchmaking queue if user is in one
      if (status.activeQueue && status.activeQueue.gameId === gameId) {
        console.log('[Arena][Sync] Restoring active matchmaking queue:', status.activeQueue);
        setUiState('QUEUED');
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(status.activeQueue.joinedAt).getTime()) / 1000));
        setQueueTimeElapsed(elapsed);
        
        if (!queueTimerRef.current) {
          let sec = elapsed;
          queueTimerRef.current = setInterval(() => {
            sec++;
            setQueueTimeElapsed(sec);
          }, 1000);
        }
        return null;
      }
      
      const targetMatchId = matchId || status.activeMatchId;
      if (!targetMatchId) {
        return null;
      }

      const matchDetails = await ArenaClientApi.fetchMatchDetails(targetMatchId, getAccessToken);
      setActiveMatch(matchDetails);

      // Authoritatively recover uiState status from backend
      if (matchDetails.status === 'MATCHED') {
        setUiState('MATCHED');
      } else if (matchDetails.status === 'COUNTDOWN') {
        setUiState('COUNTDOWN');
      } else if (matchDetails.status === 'ACTIVE') {
        setUiState('ACTIVE');
      } else if (matchDetails.status === 'COMPLETED') {
        setUiState('COMPLETED');
      } else if (matchDetails.status === 'CANCELLED') {
        setUiState('CANCELLED');
      }

      return matchDetails;
    } catch (err: any) {
      console.warn('[Arena][Sync] Non-blocking status sync failed:', err);
      throw err;
    }
  }, [gameId, getAccessToken, matchId]);

  // Match Recovery Trigger (Simplified to load rank without auto-redirect routing loops)
  const runSessionRecovery = useCallback(async () => {
    try {
      setRecoveryError(null);
      await syncWithBackend();
      setSessionRecovered(true);
    } catch (err: any) {
      console.warn('[Arena][Sync] Recovery failed, retrying in 1.5s...', err.message);
      if (recoveryTimeoutRef.current) {
        clearTimeout(recoveryTimeoutRef.current);
      }
      recoveryTimeoutRef.current = setTimeout(runSessionRecovery, 1500);
    }
  }, [syncWithBackend]);

  // Request Matchmaker Queue Entry
  const enterQueue = useCallback(async (mode: 'CASUAL' | 'RANKED' | 'WAGER', wagerAmount: string | null = null, region: string = 'global') => {
    try {
      cleanupAllServices();
      setUiState('QUEUED');
      setRecoveryError(null);

      const res = await ArenaClientApi.requestMatchmake(gameId, mode, wagerAmount, region, 50, getAccessToken);
      
      if (res.matchId) {
        localStorage.setItem('rcade_active_match_id', res.matchId);
        const details = await ArenaClientApi.fetchMatchDetails(res.matchId, getAccessToken);
        setActiveMatch(details);
      }

      if (res.status === 'ACTIVE' || res.status === 'MATCHED') {
        setUiState('MATCHED');
      } else {
        setUiState('QUEUED');
        
        setQueueTimeElapsed(0);
        let elapsed = 0;
        queueTimerRef.current = setInterval(() => {
          elapsed++;
          setQueueTimeElapsed(elapsed);
        }, 1000);
      }
    } catch (err: any) {
      console.error('[Arena][Matchmake] Entry rejected:', err);
      setRecoveryError(err.message || 'Matchmaking gateway failure');
      setUiState('IDLE');
    }
  }, [gameId, getAccessToken, cleanupAllServices]);

  // Graceful Queue Exit
  const leaveQueue = useCallback(async () => {
    const localMatchId = localStorage.getItem('rcade_active_match_id');
    if (!localMatchId) {
      setUiState('IDLE');
      return;
    }
    console.log('[Arena][Queue] Gracefully leaving queue.');
    cleanupAllServices();
    
    try {
      await ArenaClientApi.cancelMatch(localMatchId, getAccessToken);
    } catch (err) {
      console.warn('[Arena][Queue] Non-blocking queue cancellation failed:', err);
    }
    
    localStorage.removeItem('rcade_active_match_id');
    setActiveMatch(null);
    setUiState('IDLE');
    fetchHistoryAndStandings();
  }, [cleanupAllServices, getAccessToken, fetchHistoryAndStandings]);

  // --- Private Lobby Room methods ---
  const createPrivateRoom = useCallback(async (wagerAmount: string | null = null) => {
    try {
      const room = await ArenaClientApi.createRoom(gameId, wagerAmount, getAccessToken);
      setCustomRoom(room);
      setUiState('LOBBY');
    } catch (err: any) {
      console.error('[Arena][Room] Failed to create private lobby:', err);
      setRecoveryError(err.message || 'Lobby creation failed');
      setUiState('IDLE');
    }
  }, [gameId, getAccessToken]);

  const joinPrivateRoom = useCallback(async (roomCode: string) => {
    try {
      const room = await ArenaClientApi.joinRoom(roomCode, getAccessToken);
      setCustomRoom({
        id: room.id,
        roomCode: room.roomCode,
        wagerAmount: room.wagerAmount,
        guestId: room.guestId,
        status: 'READY',
        creatorId: room.creatorId
      });
      setUiState('LOBBY');
    } catch (err: any) {
      console.error('[Arena][Room] Failed to join private lobby:', err);
      setRecoveryError(err.message || 'Lobby join failed');
      setUiState('IDLE');
    }
  }, [getAccessToken]);

  const startPrivateMatch = useCallback(async () => {
    if (!customRoom) return;
    try {
      const match = await ArenaClientApi.startRoomMatch(customRoom.roomCode, getAccessToken);
      localStorage.setItem('rcade_active_match_id', match.id);
      setActiveMatch(match);
      setUiState('ACTIVE');
    } catch (err: any) {
      console.error('[Arena][Room] Failed to start lobby match:', err);
      setRecoveryError(err.message || 'Lobby match start failed');
      setUiState('LOBBY');
    }
  }, [customRoom, getAccessToken]);

  const leavePrivateRoom = useCallback(async (roomCode: string) => {
    try {
      await ArenaClientApi.leaveRoom(roomCode, getAccessToken);
      setCustomRoom(null);
      setUiState('IDLE');
    } catch (err: any) {
      console.error('[Arena][Room] Failed to leave/cancel room:', err);
      setRecoveryError(err.message || 'Lobby exit failed');
    }
  }, [getAccessToken]);

  // Start active gameplay session
  const startMatchSession = useCallback(async () => {
    const matchId = activeMatch?.id;
    if (!matchId) return;

    try {
      setUiState('ACTIVE');
    } catch (err: any) {
      console.error('[Arena][Session] Handshake failed:', err);
      setRecoveryError(err.message || 'Session setup failed');
      setUiState('IDLE');
    }
  }, [activeMatch?.id]);

  // Submit score to verifier
  const submitMatchScore = useCallback(async (
    score: number,
    durationMs: number,
    replayInputs: any,
    completed: boolean = true
  ) => {
    const matchId = localStorage.getItem('rcade_active_match_id') || activeMatch?.id;
    if (!matchId) {
      console.error('[Arena][Complete] Match ID is missing.');
      return;
    }

    try {
      setUiState('SUBMITTED');

      const payload = {
        matchId,
        score,
        duration: durationMs,
        replayInputs: replayInputs || {},
        seed: 'system-seed-v1',
        completed
      };

      setUiState('VERIFIED');
      const res = await ArenaClientApi.submitScore(payload, getAccessToken);

      if (!res.success) {
        console.error('[Arena][Complete] Telemetry rejected:', res.reason);
        cleanupAllServices();
        localStorage.removeItem('rcade_active_match_id');
        setUiState('COMPLETED');
        fetchHistoryAndStandings();
        return;
      }

      cleanupAllServices();
      localStorage.removeItem('rcade_active_match_id');
      localStorage.removeItem('rcade_active_session_id');
      setUiState('COMPLETED');
      fetchHistoryAndStandings();

    } catch (err) {
      console.error('[Arena][Complete] Score submission failed:', err);
      setUiState('IDLE');
    }
  }, [activeMatch?.id, getAccessToken, cleanupAllServices, fetchHistoryAndStandings]);

  const sendRematchRequest = useCallback(async () => {
    const targetMatchId = matchId || activeMatch?.id || (typeof window !== 'undefined' ? localStorage.getItem('rcade_active_match_id') : null);
    if (!targetMatchId) return;
    try {
      setRematchError(null);
      const token = await getAccessToken();
      const res = await fetch('/api/arena/room/rematch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ action: 'request', matchId: targetMatchId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to request rematch');
      }
      console.log('[Arena][Rematch] Requested rematch successfully.');
    } catch (err: any) {
      console.error('[Arena][Rematch] Failed to request rematch:', err);
      setRematchError(err.message || 'Failed to request rematch');
    }
  }, [matchId, activeMatch?.id, getAccessToken]);

  const acceptRematch = useCallback(async () => {
    const targetMatchId = rematchRequest?.matchId || matchId || activeMatch?.id;
    if (!targetMatchId) return;
    try {
      setRematchError(null);
      const token = await getAccessToken();
      const res = await fetch('/api/arena/room/rematch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ action: 'accept', matchId: targetMatchId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to accept rematch');
      }
      setRematchRequest(null);
      console.log('[Arena][Rematch] Accepted rematch successfully.');
    } catch (err: any) {
      console.error('[Arena][Rematch] Failed to accept rematch:', err);
      setRematchError(err.message || 'Failed to accept rematch');
      setRematchRequest(null);
    }
  }, [rematchRequest?.matchId, matchId, activeMatch?.id, getAccessToken]);

  const declineRematch = useCallback(async () => {
    const targetMatchId = rematchRequest?.matchId || matchId || activeMatch?.id;
    if (!targetMatchId) return;
    try {
      setRematchError(null);
      const token = await getAccessToken();
      const res = await fetch('/api/arena/room/rematch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ action: 'decline', matchId: targetMatchId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to decline rematch');
      }
      setRematchRequest(null);
      console.log('[Arena][Rematch] Declined rematch successfully.');
    } catch (err: any) {
      console.error('[Arena][Rematch] Failed to decline rematch:', err);
      setRematchError(err.message || 'Failed to decline rematch');
      setRematchRequest(null);
    }
  }, [rematchRequest?.matchId, matchId, activeMatch?.id, getAccessToken]);

  const clearRematchDeclined = useCallback(() => {
    setRematchDeclined(null);
  }, []);

  const clearRematchError = useCallback(() => {
    setRematchError(null);
  }, []);

  const clearRematchAccepted = useCallback(() => {
    setRematchAccepted(null);
  }, []);

  const clearOpponentLeft = useCallback(() => {
    setOpponentLeft(null);
  }, []);

  const notifyLeaveLobby = useCallback(async () => {
    const targetMatchId = matchId || activeMatch?.id || (typeof window !== 'undefined' ? localStorage.getItem('rcade_active_match_id') : null);
    if (!targetMatchId) return;
    try {
      const token = await getAccessToken();
      await fetch('/api/arena/room/rematch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ action: 'leave', matchId: targetMatchId })
      });
      console.log('[Arena][Rematch] Notified leave successfully.');
    } catch (err) {
      console.warn('[Arena][Rematch] Non-blocking leave notify failed:', err);
    }
  }, [matchId, activeMatch?.id, getAccessToken]);

  const startRematchMatch = useCallback(async (newMatchId: string) => {
    try {
      const token = await getAccessToken();
      await fetch('/api/arena/room/rematch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : ''
        },
        body: JSON.stringify({ action: 'start', matchId: newMatchId })
      });
      console.log('[Arena][Rematch] Notified start successfully.');
    } catch (err) {
      console.error('[Arena][Rematch] Failed to start rematch:', err);
    }
  }, [getAccessToken]);

  const resetState = useCallback(() => {
    cleanupAllServices();
    localStorage.removeItem('rcade_active_match_id');
    localStorage.removeItem('rcade_active_session_id');
    setActiveMatch(null);
    setUiState('IDLE');
    setRematchAccepted(null);
    setRematchRequest(null);
    setRematchDeclined(null);
    setRematchError(null);
    setOpponentLeft(null);
    fetchHistoryAndStandings();
  }, [cleanupAllServices, fetchHistoryAndStandings]);

  const retryRecovery = useCallback(() => {
    runSessionRecovery();
  }, [runSessionRecovery]);

  // 1. Trigger recovery authoritatively when authenticated state resolves
  useEffect(() => {
    if (authenticated && !sessionRecovered) {
      runSessionRecovery();
    }
  }, [authenticated, sessionRecovered, runSessionRecovery]);

  // 2. Authoritative unmount cleanup sweep
  useEffect(() => {
    return () => cleanupAllServices();
  }, [cleanupAllServices]);

  return {
    uiState,
    activeMatch,
    playerRank,
    matchHistory,
    standings,
    queueTimeElapsed,
    queueActivity,
    customRoom,
    sessionRecovered,
    recoveryError,
    sessionTimeRemaining,
    tabAuthority,
    showClaimButton,
    claimPlayAuthority,
    enterQueue,
    leaveQueue,
    createPrivateRoom,
    joinPrivateRoom,
    startPrivateMatch,
    leavePrivateRoom,
    startMatchSession,
    submitMatchScore,
    resetState,
    retryRecovery,
    fetchHistoryAndStandings,
    rematchRequest,
    sendRematchRequest,
    acceptRematch,
    declineRematch,
    rematchDeclined,
    clearRematchDeclined,
    rematchError,
    clearRematchError,
    rematchAccepted,
    clearRematchAccepted,
    opponentLeft,
    clearOpponentLeft,
    notifyLeaveLobby,
    startRematchMatch
  };
}
