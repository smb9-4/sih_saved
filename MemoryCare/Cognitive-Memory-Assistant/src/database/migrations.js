/**
 * migrations.js
 * Schema migration runner for MemoryCare SQLite database.
 * - Each migration has a numeric version and is idempotent.
 * - Uses the sync_metadata table to track the current schema version.
 * - Never drops existing patient data.
 */

import { getDB, dbRun } from './db';

const SCHEMA_VERSION_KEY = 'schema_version';

// ── Migration definitions ─────────────────────────────────────────────────────

const MIGRATIONS = [
  {
    version: 1,
    description: 'Initial schema: patients, game_sessions, difficulty_stats, sync_queue, sync_metadata',
    up: [
      // sync_metadata first — used by migration runner itself
      `CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,

      `CREATE TABLE IF NOT EXISTS patients (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        preferred_language TEXT DEFAULT 'en',
        caregiver_max_difficulty INTEGER DEFAULT 5,
        phone TEXT,
        state TEXT,
        age INTEGER,
        emergency_contact TEXT,
        emergency_phone TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        server_version INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'pending'
      )`,

      `CREATE TABLE IF NOT EXISTS game_sessions (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        game_type TEXT NOT NULL,
        difficulty_before INTEGER NOT NULL,
        difficulty_after INTEGER NOT NULL,
        accuracy REAL NOT NULL,
        completion_rate REAL NOT NULL,
        wrong_answer_rate REAL NOT NULL,
        average_response_time REAL NOT NULL,
        retry_count INTEGER DEFAULT 0,
        recent_performance_trend REAL DEFAULT 0,
        model_action TEXT NOT NULL,
        model_confidence REAL NOT NULL,
        decision_reason TEXT,
        patient_message TEXT,
        passed INTEGER DEFAULT 0,
        extra_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        server_version INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'pending',
        sync_attempts INTEGER DEFAULT 0,
        last_sync_error TEXT
      )`,

      `CREATE INDEX IF NOT EXISTS idx_game_sessions_patient
        ON game_sessions(patient_id, game_type, created_at DESC)`,

      `CREATE INDEX IF NOT EXISTS idx_game_sessions_sync
        ON game_sessions(sync_status, sync_attempts)`,

      `CREATE TABLE IF NOT EXISTS difficulty_stats (
        patient_id TEXT NOT NULL,
        game_type TEXT NOT NULL,
        difficulty_level INTEGER NOT NULL,
        attempts INTEGER DEFAULT 0,
        total_reward REAL DEFAULT 0,
        updated_at TEXT NOT NULL,
        server_version INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'pending',
        PRIMARY KEY (patient_id, game_type, difficulty_level)
      )`,

      `CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        next_retry_at TEXT,
        status TEXT DEFAULT 'pending',
        last_error TEXT,
        UNIQUE(entity_type, entity_id, operation)
      )`,

      `CREATE INDEX IF NOT EXISTS idx_sync_queue_status
        ON sync_queue(status, next_retry_at)`,
    ],
  },
];

// ── Runner ─────────────────────────────────────────────────────────────────────

async function getCurrentVersion(db) {
  try {
    const rows = await db.query(
      `SELECT value FROM sync_metadata WHERE key = ?`,
      [SCHEMA_VERSION_KEY]
    );
    const vals = rows.values || [];
    if (vals.length === 0) return 0;
    return parseInt(vals[0].value, 10) || 0;
  } catch {
    // sync_metadata table might not exist yet on first run
    return 0;
  }
}

async function setCurrentVersion(db, version) {
  const now = new Date().toISOString();
  await db.run(
    `INSERT OR REPLACE INTO sync_metadata(key, value, updated_at) VALUES (?, ?, ?)`,
    [SCHEMA_VERSION_KEY, String(version), now]
  );
}

/**
 * Run all pending migrations in order.
 * Safe to call on every app startup — skips already-applied migrations.
 */
export async function runMigrations() {
  const db = await getDB();
  const currentVersion = await getCurrentVersion(db);

  const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
  if (pending.length === 0) {
    console.log(`[migrations] Schema is up to date (v${currentVersion})`);
    return;
  }

  for (const migration of pending) {
    console.log(`[migrations] Applying v${migration.version}: ${migration.description}`);
    try {
      await db.beginTransaction();
      for (const sql of migration.up) {
        await db.run(sql, []);
      }
      await setCurrentVersion(db, migration.version);
      await db.commitTransaction();
      console.log(`[migrations] v${migration.version} applied successfully`);
    } catch (err) {
      console.error(`[migrations] v${migration.version} FAILED:`, err);
      try { await db.rollbackTransaction(); } catch (_) { /* ignore */ }
      throw err; // halt — do not run further migrations on partial failure
    }
  }

  console.log(`[migrations] All migrations applied. Schema now at v${MIGRATIONS[MIGRATIONS.length - 1].version}`);
}

/**
 * Migrate existing localStorage data into SQLite on first run.
 * This is a one-time operation guarded by the sync_metadata flag.
 */
export async function migrateFromLocalStorage(patientId) {
  const db = await getDB();
  try {
    const rows = await db.query(
      `SELECT value FROM sync_metadata WHERE key = ?`,
      ['ls_migrated']
    );
    if ((rows.values || []).length > 0) return; // already done
  } catch {
    return;
  }

  console.log('[migrations] Migrating localStorage data to SQLite...');

  try {
    const raw = localStorage.getItem('memoryCareOfflineMetrics');
    if (raw) {
      const sessions = JSON.parse(raw);
      const now = new Date().toISOString();
      for (const s of sessions) {
        const id = s.id || crypto.randomUUID();
        await dbRun(
          `INSERT OR IGNORE INTO game_sessions
            (id, patient_id, game_type, difficulty_before, difficulty_after,
             accuracy, completion_rate, wrong_answer_rate, average_response_time,
             retry_count, recent_performance_trend, model_action, model_confidence,
             decision_reason, patient_message, passed, extra_json,
             created_at, updated_at, server_version, sync_status, sync_attempts)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            id,
            patientId || s.patient_id || 'unknown',
            s.game_type || 'pattern_matching',
            s.difficulty_before || 1,
            s.difficulty_after || 1,
            s.accuracy || 0,
            s.completion_rate ?? 1,
            s.wrong_answer_rate || 0,
            s.average_response_time || 0,
            s.retry_count || 0,
            s.recent_performance_trend || 0,
            s.model_action || 'KEEP_DIFFICULTY',
            s.model_confidence || 1,
            s.decision_reason || '',
            s.patient_message || '',
            s.completion_rate >= 0.5 ? 1 : 0,
            s.extra ? JSON.stringify(s.extra) : null,
            s.timestamp || now,
            now,
            0,
            'migrated',
            0,
          ]
        );
      }
      console.log(`[migrations] Migrated ${sessions.length} sessions from localStorage`);
    }

    const now = new Date().toISOString();
    await dbRun(
      `INSERT OR REPLACE INTO sync_metadata(key, value, updated_at) VALUES (?, ?, ?)`,
      ['ls_migrated', '1', now]
    );
  } catch (err) {
    console.warn('[migrations] localStorage migration failed (non-fatal):', err);
  }
}

const migrations = { runMigrations, migrateFromLocalStorage };
export default migrations;
