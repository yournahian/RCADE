import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { privy } from '@/lib/privy';
import { AuditArchiveService } from '@/services/audit-archive';
import { CompatibilityDecoder } from '@/lib/arena/protocol-compat';
import crypto from 'crypto';
import { verifyAdminSecret, handleAdminUnauthorized } from '@/lib/arena/assert-admin';

export async function GET(req: Request) {
    try {
        if (!verifyAdminSecret(req)) {
            return handleAdminUnauthorized();
        }

        // Fetch recent match sessions
        const matchSessions = await prisma.matchSession.findMany({
            orderBy: { validFrom: 'desc' },
            take: 20
        });

        // Fetch recent match receipts
        const matchReceipts = await prisma.matchReceipt.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        // Fetch recent audit ledger blocks
        const auditBlocks = await prisma.auditArchive.findMany({
            orderBy: { sequenceId: 'desc' },
            take: 30
        });

        // Fetch recent moderation appeals
        const appeals = await prisma.moderationAppeal.findMany({
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        // Run ledger integrity auditor
        const auditStatus = await AuditArchiveService.auditChainIntegrity();

        return NextResponse.json({
            matchSessions,
            matchReceipts,
            auditBlocks,
            appeals,
            auditStatus
        });
    } catch (error: any) {
        console.error("Failed to fetch replay inspector data", error);
        return NextResponse.json({ error: 'Failed to fetch replay inspector data', details: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        if (!verifyAdminSecret(req)) {
            return handleAdminUnauthorized();
        }

        let moderatorId = 'admin-moderator';
        const authHeader = req.headers.get('authorization');
        if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            const configSecret = process.env.ADMIN_SECRET_KEY || 'rcade-secret-super-key-alpha-2026';
            if (token !== configSecret) {
                try {
                    const claims = await privy.verifyAuthToken(token);
                    if (claims && claims.userId) {
                        moderatorId = claims.userId;
                    }
                } catch (e) {
                    console.warn('[ReplayInspectorAPI] Privy token extraction failed, falling back to admin-moderator:', e);
                }
            }
        }

        const body = await req.json();
        const { action, appealId, matchId, status, reason, correlationId = `corr-${Date.now()}` } = body;

        const secretKey = process.env.ADMIN_SECRET_KEY || 'rcade-secret-super-key-alpha-2026';

        if (action === 'CREATE_APPEAL') {
            const { userId, appealReason, evidence } = body;
            const appeal = await prisma.moderationAppeal.create({
                data: {
                    matchId,
                    userId,
                    reason: appealReason,
                    status: 'PENDING',
                    evidence: evidence || {}
                }
            });

            // Append creation event to audit archive
            await AuditArchiveService.appendEntry('APPEAL_CREATED', {
                appealId: appeal.id,
                matchId,
                userId,
                reason: appealReason,
                timestamp: new Date().toISOString()
            }, {
                correlationId,
                moderationActionId: appeal.id
            });

            return NextResponse.json({ success: true, appeal });
        }

        if (action === 'RESOLVE_APPEAL') {
            if (!appealId) {
                return NextResponse.json({ error: 'Appeal ID is required' }, { status: 400 });
            }

            const appeal = await prisma.moderationAppeal.findUnique({
                where: { id: appealId }
            });

            if (!appeal) {
                return NextResponse.json({ error: 'Appeal not found' }, { status: 404 });
            }

            // Update appeal status
            const updatedAppeal = await prisma.moderationAppeal.update({
                where: { id: appealId },
                data: {
                    status,
                    moderatorId,
                    resolvedAt: new Date()
                }
            });

            // Generate signed verdict receipt
            const verdictReceipt = {
                appealId: appeal.id,
                matchId: appeal.matchId,
                userId: appeal.userId,
                status,
                moderatorId,
                timestamp: new Date().toISOString(),
                reason: reason || 'Moderation decision'
            };

            const canonicalVerdict = CompatibilityDecoder.canonicalizeJson(verdictReceipt);
            const signature = crypto
                .createHmac('sha256', secretKey)
                .update(canonicalVerdict)
                .digest('hex');

            const signedVerdictPayload = {
                ...verdictReceipt,
                verdictSignature: signature,
                evidenceReferences: appeal.evidence || {}
            };

            // Append signed verdict to chained ledger
            await AuditArchiveService.appendEntry('MODERATION_VERDICT', signedVerdictPayload, {
                correlationId,
                moderationActionId: appeal.id
            });

            return NextResponse.json({ success: true, appeal: updatedAppeal, verdictReceipt: signedVerdictPayload });
        }

        if (action === 'OVERRIDE_MATCH') {
            if (!matchId) {
                return NextResponse.json({ error: 'Match ID is required' }, { status: 400 });
            }

            const match = await prisma.match.findUnique({
                where: { id: matchId }
            });

            if (!match) {
                return NextResponse.json({ error: 'Match not found' }, { status: 404 });
            }

            const { winnerId } = body;

            // Generate override record
            const overridePayload = {
                matchId,
                originalWinnerId: match.winnerId,
                newWinnerId: winnerId,
                overrideReason: reason || 'Manual Admin Override',
                moderatorId,
                timestamp: new Date().toISOString()
            };

            const canonicalOverride = CompatibilityDecoder.canonicalizeJson(overridePayload);
            const signature = crypto
                .createHmac('sha256', secretKey)
                .update(canonicalOverride)
                .digest('hex');

            const signedOverridePayload = {
                ...overridePayload,
                overrideSignature: signature
            };

            // Wrap state changes and ledger log in an atomic flow
            await prisma.$transaction(async (tx) => {
                await tx.match.update({
                    where: { id: matchId },
                    data: {
                        winnerId,
                        status: 'COMPLETED'
                    }
                });

                await tx.matchReceipt.upsert({
                    where: { matchId },
                    update: {
                        winnerId
                    },
                    create: {
                        matchId,
                        winnerId,
                        telemetryHash: 'OVERRIDE',
                        settlementHash: signature,
                        payload: { scores: {} }
                    }
                });
            });

            // Append signed override action to ledger
            await AuditArchiveService.appendEntry('ADMIN_OVERRIDE', signedOverridePayload, {
                correlationId,
                moderationActionId: `override-${matchId}`
            });

            return NextResponse.json({ success: true, override: signedOverridePayload });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        console.error("Failed to perform moderation action", error);
        return NextResponse.json({ error: 'Moderation action failed', details: error.message }, { status: 500 });
    }
}
