import { prisma } from '@/lib/prisma';
import { EscrowService } from './EscrowService';
type ArenaMatch = any;

export class RoomService {
  /**
   * Generates a unique 6-character alphanumeric custom room invite code.
   */
  private static generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // clear characters to prevent confusion (no I, O, 0, 1)
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  static async createRoom(creatorId: string, gameId: number, wagerAmount: string | null) {
    console.log(`[Room][Create] User ${creatorId} creating custom lobby for game ${gameId}. Stake: ${wagerAmount || 'FREE'}`);

    // Ensure Creator User record exists in database
    let user = await prisma.user.findUnique({ where: { id: creatorId } });
    if (!user) {
      await prisma.user.create({
        data: {
          id: creatorId,
          username: `User_${creatorId.substring(12, 18)}`
        }
      });
    }

    const roomCode = this.generateRoomCode();

    const room = await prisma.arenaRoom.create({
      data: {
        roomCode,
        gameId,
        creatorId,
        wagerAmount,
        platformFee: wagerAmount ? (parseFloat(wagerAmount) * 2 * 0.10).toFixed(2) : '0.00', // 10% platform fee for custom rooms
        status: 'LOBBY'
      }
    });

    return room;
  }

  /**
   * Pairs a guest user with an existing custom room using its room code.
   */
  static async joinRoom(guestId: string, roomCode: string) {
    const cleanCode = roomCode.trim().toUpperCase();
    console.log(`[Room][Join] User ${guestId} attempting to join lobby: ${cleanCode}`);

    // Ensure Guest User record exists in database
    let user = await prisma.user.findUnique({ where: { id: guestId } });
    if (!user) {
      await prisma.user.create({
        data: {
          id: guestId,
          username: `User_${guestId.substring(12, 18)}`
        }
      });
    }

    const room = await prisma.arenaRoom.findUnique({
      where: { roomCode: cleanCode }
    });

    if (!room) {
      throw new Error(`Custom room not found: ${cleanCode}`);
    }

    if (room.status !== 'LOBBY') {
      throw new Error(`Lobby is currently unavailable (Status: ${room.status})`);
    }



    const updatedRoom = await prisma.arenaRoom.update({
      where: { id: room.id },
      data: {
        guestId,
        status: 'READY'
      }
    });

    return updatedRoom;
  }

  /**
   * Transitions a paired lobby room into an active Arena Match.
   */
  static async startRoomMatch(roomCode: string): Promise<ArenaMatch> {
    const cleanCode = roomCode.trim().toUpperCase();
    console.log(`[Room][Start] Advancing lobby ${cleanCode} into competitive match mode.`);

    const room = await prisma.arenaRoom.findUnique({
      where: { roomCode: cleanCode }
    });

    if (!room || !room.guestId) {
      throw new Error('Cannot start room match without 2 paired players');
    }

    // Create the ArenaMatch
    const match = await prisma.arenaMatch.create({
      data: {
        gameId: room.gameId,
        mode: 'CUSTOM', // private rooms do not modify trophies
        roomCode: room.roomCode,
        status: 'ACTIVE',
        player1Id: room.creatorId,
        player2Id: room.guestId
      }
    });

    // Handle custom wagers in Escrow with a 10% platform fee
    if (room.wagerAmount && parseFloat(room.wagerAmount) > 0) {
      const escrowId = await EscrowService.holdWager(
        match.id,
        room.creatorId,
        room.guestId,
        room.wagerAmount,
        true // isCustomRoom = true triggers 10% platform fee
      );

      await prisma.arenaMatch.update({
        where: { id: match.id },
        data: { escrowId }
      });
    }

    // Update room status
    await prisma.arenaRoom.update({
      where: { id: room.id },
      data: {
        status: 'PLAYING',
        matchId: match.id
      }
    });

    return match;
  }

  /**
   * Gracefully leaves or cancels a custom room lobby.
   */
  static async leaveRoom(userId: string, roomCode: string) {
    const cleanCode = roomCode.trim().toUpperCase();
    const room = await prisma.arenaRoom.findUnique({
      where: { roomCode: cleanCode }
    });

    if (!room) {
      throw new Error(`Custom room not found: ${cleanCode}`);
    }

    if (room.creatorId === userId) {
      // Host cancels the room lobby authoritatively
      const updated = await prisma.arenaRoom.update({
        where: { id: room.id },
        data: { status: 'CANCELLED' }
      });
      console.log(`[Room][Cancel] Private lobby ${cleanCode} cancelled by Host ${userId}.`);
      return updated;
    } else if (room.guestId === userId) {
      // Guest leaves the room lobby, returning it to LOBBY status for new guest invitations
      const updated = await prisma.arenaRoom.update({
        where: { id: room.id },
        data: { guestId: null, status: 'LOBBY' }
      });
      console.log(`[Room][Leave] Guest ${userId} left private lobby ${cleanCode}.`);
      return updated;
    }

    throw new Error('User is not a registered participant in this private lobby');
  }
}
