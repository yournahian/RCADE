export interface SecurityAlertPayload {
  matchId: string;
  userId: string;
  category:
  | 'REPLAY_TAMPERING'
  | 'IMPOSSIBLE_DIRECTION'
  | 'DRIFT_VIOLATION'
  | 'CHECKSUM_DIVERGENCE'
  | 'MULTI_TAB_EXPLOIT'
  | 'RATE_LIMIT_BURST';
  severity: 'SOFT' | 'HARD' | 'CRITICAL';
  details: string;
}

/**
 * Competitive Arena Invalidation & Security Webhook Escalation Engine.
 * Channels alerts to security channels to protect Glicko progression from hacks.
 */
export async function sendSecurityAlert(payload: SecurityAlertPayload) {
  try {
    // Soft alerts are strictly database-only to prevent developer notification fatigue
    if (payload.severity === 'SOFT') {
      console.log(
        `[Arena][SecurityAlert][Soft] User: ${payload.userId} | Category: ${payload.category} | Details: ${payload.details}`
      );
      return;
    }

    // 1. Repeat offenders check & escalation webhook assignment
    let isRepeatOffender = false;
    let previousInvalidations = 0;

    try {
      const { prisma } = require('@/lib/prisma');

      previousInvalidations = await prisma.matchSession.count({
        where: {
          userId: payload.userId,
          status: 'INVALIDATED'
        }
      });

      // 1 or more previous invalidations means repeat offender
      if (previousInvalidations >= 1) {
        isRepeatOffender = true;
      }
    } catch (dbErr) {
      console.warn(
        '[Arena][SecurityAlert] Failed to count user invalidations:',
        dbErr
      );
    }

    // FIXED: determine target webhook correctly
    const targetWebhookUrl = isRepeatOffender
      ? process.env.DISCORD_ESCALATION_WEBHOOK
      : process.env.DISCORD_SECURITY_WEBHOOK;

    // Always persist the anomaly in the tamper-evident AuditArchive ledger
    try {
      const { AuditArchiveService } = require('@/services/audit-archive');

      await AuditArchiveService.appendEntry(
        'ANOMALY_LOG',
        {
          matchId: payload.matchId,
          userId: payload.userId,
          category: payload.category,
          severity: payload.severity,
          details: payload.details,
          isRepeatOffender,
          previousInvalidations,
          alertDispatched: !!targetWebhookUrl
        },
        {
          correlationId: `ANOMALY:${payload.matchId}:${payload.userId}`
        }
      );
    } catch (archiveErr) {
      console.error(
        '[Arena][SecurityAlert] Failed to write anomaly to immutable AuditArchive ledger:',
        archiveErr
      );
    }

    // No webhook configured → fail open safely
    if (!targetWebhookUrl) {
      console.info(
        '[Arena][SecurityAlert] No target Discord webhook configured. Skipping HTTP dispatch.'
      );
      return;
    }

    const discordMessage = {
      username: isRepeatOffender
        ? 'RCADE Arena Mainboard Sentinel [ESCALATION]'
        : 'RCADE Arena Mainboard Sentinel',

      avatar_url: 'https://rcade.io/sentinel.png',

      embeds: [
        {
          title: isRepeatOffender
            ? `🚨 REPEAT OFFENDER ESCALATED: competitive anomaly (${payload.severity})`
            : `🛡️ Competitive anomaly flagged (${payload.severity})`,

          color:
            isRepeatOffender || payload.severity === 'CRITICAL'
              ? 16711680
              : 16753920,

          fields: [
            {
              name: 'Match ID',
              value: `\`${payload.matchId}\``,
              inline: true
            },
            {
              name: 'Player ID',
              value: `\`${payload.userId}\``,
              inline: true
            },
            {
              name: 'Category',
              value: `**${payload.category}**`,
              inline: true
            },
            {
              name: 'Details',
              value: payload.details,
              inline: false
            },
            {
              name: 'Previous Offenses',
              value: `\`${previousInvalidations}\` detected anomalies`,
              inline: true
            },
            {
              name: 'Action Taken',
              value: isRepeatOffender
                ? 'ESCALATION - Match Invalidated & Account Flagged'
                : payload.severity === 'CRITICAL'
                  ? 'Match Invalidated & Escalated'
                  : 'Match Invalidated',
              inline: false
            }
          ],

          timestamp: new Date().toISOString(),

          footer: {
            text: 'RCADE Competitive Integrity Engine'
          }
        }
      ]
    };

    try {
      const res = await fetch(targetWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(discordMessage)
      });

      if (!res.ok) {
        console.error(
          `[Arena][SecurityAlert] Webhook post failed (Status: ${res.status})`
        );

        try {
          const { AuditArchiveService } = require('@/services/audit-archive');

          await AuditArchiveService.appendEntry(
            'WEBHOOK_OUTAGE_FALLBACK',
            {
              matchId: payload.matchId,
              userId: payload.userId,
              category: payload.category,
              details: payload.details,
              statusCode: res.status
            },
            {
              correlationId: `WEBHOOK_FAIL:${payload.matchId}`
            }
          );
        } catch (innerErr) {
          console.error(
            '[Arena][SecurityAlert] Outage fallback record failed:',
            innerErr
          );
        }
      }
    } catch (fetchErr: any) {
      console.error(
        '[Arena][SecurityAlert][Outage] Webhook network failed, engaging fail-open ledger auditing:',
        fetchErr
      );

      try {
        const { AuditArchiveService } = require('@/services/audit-archive');

        await AuditArchiveService.appendEntry(
          'WEBHOOK_OUTAGE_FALLBACK',
          {
            matchId: payload.matchId,
            userId: payload.userId,
            category: payload.category,
            details: payload.details,
            fetchError: fetchErr.message || String(fetchErr)
          },
          {
            correlationId: `WEBHOOK_FAIL:${payload.matchId}`
          }
        );
      } catch (innerErr) {
        console.error(
          '[Arena][SecurityAlert] Outage fallback record failed:',
          innerErr
        );
      }
    }
  } catch (err) {
    // Fail-open: prevent logging errors from halting match resolution loops
    console.error(
      '[Arena][SecurityAlert][Crash] Webhook engine encountered a communication issue:',
      err
    );
  }
}