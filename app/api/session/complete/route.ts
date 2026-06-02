import { NextResponse } from 'next/server';
import { privy } from '@/lib/privy';
import { prisma } from '@/lib/prisma';
import { RewardService } from '@/services/reward';
import fs from 'fs';

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.replace('Bearer ', '');
        const verifiedClaims = await privy.verifyAuthToken(token);
        
        const { sessionId, gameSlug, score, scoreEarned, combo, duration, completed } = await req.json();

        // 1. Validate Session
        const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
        if (!session || session.userId !== verifiedClaims.userId || session.status !== 'ACTIVE') {
            return NextResponse.json({ error: 'Invalid or expired session' }, { status: 403 });
        }

        const level = session.level;

        // 2. Anti-cheat Validation
        const sessionAgeMs = Date.now() - session.validFrom.getTime();
        console.log(`[GameplayLoop][AntiCheat] Verifying session time elapsed: age: ${sessionAgeMs}ms | run duration: ${duration}ms`);
        // Allow a 60-second buffer for database clock drift (Neon DB vs Local Server)
        if (duration > sessionAgeMs + 60000) {
            console.warn(`[GameplayLoop][AntiCheat][Violation] Duration mismatch detected. duration: ${duration}, sessionAgeMs: ${sessionAgeMs}`);
            fs.appendFileSync('anticheat-debug.log', `[Duration Mismatch] duration: ${duration}, sessionAgeMs: ${sessionAgeMs}, validFrom: ${session.validFrom}, now: ${Date.now()}\n`);
            await prisma.gameSession.update({ where: { id: sessionId }, data: { status: 'INVALIDATED' } });
            return NextResponse.json({ error: 'Duration mismatch detected' }, { status: 400 });
        }

        // Lightweight score validation: assume max 500 points per second (generous for MVP combos)
        const maxPossibleScore = (duration / 1000) * 500;
        const earned = (scoreEarned !== undefined && !isNaN(scoreEarned)) ? scoreEarned : score;
        if (earned > maxPossibleScore && earned > 1000) {
            console.warn(`[GameplayLoop][AntiCheat][Violation] Impossible score detected. earned: ${earned}, maxPossible: ${maxPossibleScore}`);
            fs.appendFileSync('anticheat-debug.log', `[Score Mismatch] earned: ${earned}, maxPossibleScore: ${maxPossibleScore}, duration: ${duration}, scoreEarned: ${scoreEarned}, score: ${score}\n`);
            await prisma.gameSession.update({ where: { id: sessionId }, data: { status: 'INVALIDATED' } });
            return NextResponse.json({ error: 'Impossible score detected' }, { status: 400 });
        }

        console.log(`[GameplayLoop][Session] Marking session ${sessionId} as COMPLETED. userId: ${verifiedClaims.userId}`);
        // 3. Mark session complete
        await prisma.gameSession.update({ where: { id: sessionId }, data: { status: 'COMPLETED' } });

        // 4. Record the run
        const run = await prisma.gameRun.create({
            data: {
                userId: verifiedClaims.userId,
                level,
                score,
                combo,
                duration,
                completed
            }
        });

        // 5. Update level progress
        const existingProgress = await prisma.levelProgress.findUnique({
            where: { userId_level: { userId: verifiedClaims.userId, level } }
        });

        if (existingProgress) {
            await prisma.levelProgress.update({
                where: { id: existingProgress.id },
                data: {
                    completed: completed || existingProgress.completed,
                    highestScore: Math.max(score, existingProgress.highestScore),
                    bestCombo: Math.max(combo, existingProgress.bestCombo),
                    completedAt: completed && !existingProgress.completed ? new Date() : existingProgress.completedAt
                }
            });
        } else {
            await prisma.levelProgress.create({
                data: {
                    userId: verifiedClaims.userId,
                    level,
                    completed,
                    highestScore: score,
                    bestCombo: combo,
                    completedAt: completed ? new Date() : null
                }
            });
        }

        // 6. Update user aggregate stats (scores only — progression is driven by NFTOwnership, not completion)
        const user = await prisma.user.findUnique({ where: { id: verifiedClaims.userId } });
        if (user) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    highestScore: Math.max(score, user.highestScore),
                    highestCombo: Math.max(combo, user.highestCombo)
                    // highestUnlockedLevel intentionally NOT updated.
                    // NFTOwnership is the sole progression authority.
                }
            });
        }

        // 7. Reward Generation — Model B: Replay Recovery with Strict Web3 Gating
        let generatedReward = null;
        if (completed) {
            const activeSlug = gameSlug || 'neon-snake';
            const levelIdStr = `${activeSlug}-${level}`;
            console.log(`[GameplayLoop][Reward] Releasing prepared reward item for Game ${activeSlug} Level ${level} inside session ${sessionId} (${levelIdStr})`);
            generatedReward = await RewardService.checkAndGenerateReward(
                verifiedClaims.userId,
                levelIdStr,
                sessionId,
                "season-1",
                user?.wallet ?? null   // ← wallet enables NFTOwnership check
            );
        }

        return NextResponse.json({ success: true, run, reward: generatedReward });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Failed to complete session' }, { status: 500 });
    }
}
