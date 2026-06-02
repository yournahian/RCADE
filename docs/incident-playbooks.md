# RCADE Competitive Arena: Production Incident Playbooks

This playbook details standard operating procedures (SOP) for operators and SRE engineers to diagnose and resolve production failures, verifier anomalies, database saturation, and cryptographic ledger integrity breakages.

---

## 🚨 Playbook A: Verifier Instability & False-Positive Reviews

When active players encounter repeated anti-cheat invalidations (`status: INVALIDATED`), causing progression blocks and player complaints.

### 1. Verification Diagnostics
1. Identify the compromised player and match session from the **Replay Inspector Console** at `/admin/replay-inspector`.
2. Inspect the specific invalidation code category:
   - `REPLAY_TAMPERING`: Replay payload checksum mismatched or chain broken.
   - `IMPOSSIBLE_DIRECTION`: Angle changes exceeded the physics curve budget.
   - `DRIFT_VIOLATION`: Match session expired the dynamic latency buffer.

### 2. Immediate Mitigations
* **Temporary Threshold Overrides**:
  - If a gaming patch increases player speed or input frames, adjust verifier drift buffers in `services/arena-verifier.ts` to accommodate the new telemetry ranges.
* **Manual Override Override**:
  - If the audit verifies a false positive, navigate to the `/admin/replay-inspector` appeal panel.
  - Approve the moderation appeal (`ModerationAppeal` model) to automatically trigger MMR recalibration for the affected match.

---

## 🎛️ Playbook B: Database Connection & Lock Saturation

When database transaction times exceed p99 limits, or matchmaking queue times surge due to lock contention.

### 1. Performance Diagnostics
1. Check the **Operations Nerve Center** at `/admin/operations` to read current latencies and wait times.
2. Confirm if the lock coordinator has degraded:
   - Check `lockCoordinator` status in `/api/admin/arena/operations-data`.
   - If it shows `DATABASE_LOCK_FALLBACK`, the system has dynamically bypassed Redis.

### 2. Immediate Mitigations
* **Trigger Memory Sweep**:
  - Click **Flush Heap & Run GC Sweep** in the Operations Dashboard to manually purge V8 heap leaks and flush cached telemetry data.
* **Tuning PG Pools**:
  - If Neon pools are saturated, check for long-running unreleased locks in PostgreSQL:
    ```sql
    SELECT key, holder, "expiresAt" FROM "DistributedLock" WHERE "expiresAt" < NOW();
    ```
  - Click **Resolve Incomplete Transactions** to clear stale/hanging locks and run rollback recoveries.

---

## 🛡️ Playbook C: Chained Ledger Breaks & Cryptographic Tampering

When the background metrics alert triggers `replay_chain_breaks_total 1` indicating that historical ledger rows have been tampered with.

### 1. Integrity Diagnostics
1. Dispatch an immediate ledger audit from the dashboard by clicking **Verify Ledger Integrity**.
2. Identify the first broken block sequence sequence ID.
3. Query the specific block details directly:
   ```sql
   SELECT * FROM "AuditArchive" WHERE "sequenceId" = [broken_sequence_id];
   ```

### 2. Immediate Mitigations
> [!CAUTION]
> **LOCK DOWN SETTLEMENTS**
> If a database hack is confirmed (meaning historical currentHash fails mathematical validation against prevHash), immediately freeze matches by toggling the tournament shutoff feature flag.

* **Rebuild & Restore Evidence**:
  - Fetch the last cryptographically authenticated signed bundle from S3 cold backups.
  - Audit the delta against downstream database rows.
  - Re-inject authenticated receipts and rebuild current hashes from the checkpoint tip.

---

## 📢 Playbook D: Outbound Webhook Outage & Audit Recovery

When the Discord notification webhook endpoint is down or timing out, triggering alert delays.

### 1. Outage Diagnostics
1. Read the **Sentinel SRE Diagnostic Logger** in the Operations Dashboard.
2. Look for `WEBHOOK_OUTAGE_FALLBACK` logs.
3. Check the count of webhooks outages in the database:
   ```sql
   SELECT COUNT(*) FROM "AuditArchive" WHERE "entryType" = 'WEBHOOK_OUTAGE_FALLBACK';
   ```

### 2. Immediate Mitigations
* **Fail-Open Verification**:
  - RCADE incorporates a fail-open design. Matches will continue to settle even when Discord is down.
  - The security alerts are preserved locally inside the immutable database ledger.
* **Notification Replay**:
  - Once the Discord endpoint recovers, retrieve all logged alerts during the outage window:
    ```sql
    SELECT payload FROM "AuditArchive" WHERE "entryType" = 'WEBHOOK_OUTAGE_FALLBACK' AND timestamp > [outage_start];
    ```
  - Run the notification replay utility to post missing audit logs back to Discord channels.
