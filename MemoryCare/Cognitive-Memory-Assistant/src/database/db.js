/**
 * db.js
 * SQLite singleton for MemoryCare.
 * - On Android (Capacitor): uses @capacitor-community/sqlite natively
 * - On web / dev server: uses jeep-sqlite WASM via IndexedDB
 * - On Node.js / Jest / test environment: uses an in-memory SQL store for instant, deterministic testing
 */

const DB_NAME = 'memorycaredb';
const DB_VERSION = 1;

let _db = null;
let _sqlite = null;
let _initializing = null;

function isCapacitorNative() {
  return (
    typeof window !== 'undefined' &&
    window.Capacitor &&
    window.Capacitor.isNativePlatform &&
    window.Capacitor.isNativePlatform()
  );
}

// ── In-memory SQL engine for Jest / test environment and fallback ────────────

export function createMemoryDb() {
  const tables = {
    sync_metadata: new Map(),
    patients: new Map(),
    game_sessions: new Map(),
    difficulty_stats: new Map(),
    sync_queue: new Map(),
  };

  return {
    async execute(sql) {
      return { changes: { changes: 0 } };
    },

    async query(sql, values = []) {
      const cleanSql = sql.trim().replace(/\s+/g, ' ');

      // 1. sync_metadata
      if (cleanSql.includes('FROM sync_metadata')) {
        if (cleanSql.includes('WHERE key = ?')) {
          const key = values[0];
          const val = tables.sync_metadata.get(key);
          return { values: val ? [{ key, value: val.value, updated_at: val.updated_at }] : [] };
        }
        return { values: Array.from(tables.sync_metadata.values()) };
      }

      // 2. patients
      if (cleanSql.includes('FROM patients')) {
        if (cleanSql.includes('WHERE id = ?')) {
          const id = values[0];
          const p = tables.patients.get(id);
          return { values: p ? [{ ...p }] : [] };
        }
        return { values: Array.from(tables.patients.values()) };
      }

      // 3. game_sessions
      if (cleanSql.includes('FROM game_sessions')) {
        if (cleanSql.includes('COUNT(*)')) {
          let rows = Array.from(tables.game_sessions.values()).filter((s) => s.completion_rate >= 0.5);
          if (values.length >= 1) rows = rows.filter((s) => s.patient_id === values[0]);
          if (values.length >= 2) rows = rows.filter((s) => s.game_type === values[1]);
          return { values: [{ count: rows.length }] };
        }
        if (cleanSql.includes('WHERE id = ?')) {
          const id = values[0];
          const s = tables.game_sessions.get(id);
          return { values: s ? [{ ...s }] : [] };
        }
        let rows = Array.from(tables.game_sessions.values());
        if (cleanSql.includes('patient_id = ?')) {
          const pid = values[0];
          rows = rows.filter((s) => s.patient_id === pid);
        }
        if (cleanSql.includes('game_type = ?')) {
          const gtIndex = cleanSql.includes('patient_id = ?') ? 1 : 0;
          const gt = values[gtIndex];
          rows = rows.filter((s) => s.game_type === gt);
        }
        // sort by created_at DESC
        rows.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        return { values: rows };
      }

      // 4. difficulty_stats
      if (cleanSql.includes('FROM difficulty_stats')) {
        if (cleanSql.includes('patient_id = ? AND game_type = ? AND difficulty_level = ?')) {
          const [pid, gt, lvl] = values;
          const key = `${pid}:${gt}:${lvl}`;
          const stat = tables.difficulty_stats.get(key);
          return { values: stat ? [{ ...stat }] : [] };
        }
        let rows = Array.from(tables.difficulty_stats.values());
        if (cleanSql.includes('patient_id = ?')) {
          rows = rows.filter((s) => s.patient_id === values[0]);
        }
        if (cleanSql.includes('game_type = ?')) {
          rows = rows.filter((s) => s.game_type === values[1]);
        }
        return { values: rows };
      }

      // 5. sync_queue
      if (cleanSql.includes('FROM sync_queue')) {
        if (cleanSql.includes('COUNT(*)')) {
          if (cleanSql.includes("status = 'pending'") || (cleanSql.includes('status = ?') && values[0] === 'pending')) {
            const cnt = Array.from(tables.sync_queue.values()).filter((q) => q.status === 'pending').length;
            return { values: [{ count: cnt }] };
          }
          if (cleanSql.includes("status = 'failed'") || (cleanSql.includes('status = ?') && values[0] === 'failed')) {
            const cnt = Array.from(tables.sync_queue.values()).filter((q) => q.status === 'failed').length;
            return { values: [{ count: cnt }] };
          }
        }
        if (cleanSql.includes('WHERE entity_type = ? AND entity_id = ? AND operation = ?')) {
          const [et, eid, op] = values;
          const item = Array.from(tables.sync_queue.values()).find(
            (q) => q.entity_type === et && q.entity_id === eid && q.operation === op
          );
          return { values: item ? [{ id: item.id, attempts: item.attempts }] : [] };
        }
        if (cleanSql.includes("status IN ('pending', 'failed')")) {
          const rows = Array.from(tables.sync_queue.values()).filter(
            (q) => q.status === 'pending' || q.status === 'failed'
          );
          rows.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
          return { values: rows };
        }
        return { values: Array.from(tables.sync_queue.values()) };
      }

      return { values: [] };
    },

    async run(sql, values = []) {
      const cleanSql = sql.trim().replace(/\s+/g, ' ');

      // 1. sync_metadata
      if (cleanSql.includes('INTO sync_metadata')) {
        const [key, value, updated_at] = values;
        tables.sync_metadata.set(key, { key, value: String(value), updated_at });
        return { changes: { changes: 1 } };
      }

      // 2. game_sessions
      if (cleanSql.includes('INTO game_sessions')) {
        const [
          id, patient_id, game_type, difficulty_before, difficulty_after,
          accuracy, completion_rate, wrong_answer_rate, average_response_time,
          retry_count, recent_performance_trend, model_action, model_confidence,
          decision_reason, patient_message, passed, extra_json,
          created_at, updated_at, server_version, sync_status, sync_attempts, last_sync_error
        ] = values;

        tables.game_sessions.set(id, {
          id, patient_id, game_type,
          difficulty_before: Number(difficulty_before),
          difficulty_after: Number(difficulty_after),
          accuracy: Number(accuracy),
          completion_rate: Number(completion_rate),
          wrong_answer_rate: Number(wrong_answer_rate),
          average_response_time: Number(average_response_time),
          retry_count: Number(retry_count),
          recent_performance_trend: Number(recent_performance_trend),
          model_action, model_confidence: Number(model_confidence),
          decision_reason, patient_message,
          passed: Number(passed),
          extra_json, created_at, updated_at,
          server_version: Number(server_version) || 0,
          sync_status: sync_status || 'pending',
          sync_attempts: Number(sync_attempts) || 0,
          last_sync_error
        });
        return { changes: { changes: 1 } };
      }

      if (cleanSql.includes('UPDATE game_sessions')) {
        if (cleanSql.includes("SET sync_status = 'synced'")) {
          const [serverVersion, updatedAt, id] = values;
          const s = tables.game_sessions.get(id);
          if (s) {
            s.sync_status = 'synced';
            s.server_version = serverVersion;
            s.updated_at = updatedAt;
            s.last_sync_error = null;
          }
        } else if (cleanSql.includes("SET sync_status = 'failed'")) {
          const [err, updatedAt, id] = values;
          const s = tables.game_sessions.get(id);
          if (s) {
            s.sync_status = 'failed';
            s.sync_attempts = (s.sync_attempts || 0) + 1;
            s.last_sync_error = err;
            s.updated_at = updatedAt;
          }
        }
        return { changes: { changes: 1 } };
      }

      // 3. difficulty_stats
      if (cleanSql.includes('INTO difficulty_stats')) {
        const [patient_id, game_type, difficulty_level, attempts, total_reward, updated_at, server_version, sync_status] = values;
        const key = `${patient_id}:${game_type}:${difficulty_level}`;
        tables.difficulty_stats.set(key, {
          patient_id, game_type,
          difficulty_level: Number(difficulty_level),
          attempts: Number(attempts),
          total_reward: Number(total_reward),
          updated_at,
          server_version: Number(server_version) || 0,
          sync_status: sync_status || 'pending'
        });
        return { changes: { changes: 1 } };
      }

      if (cleanSql.includes('UPDATE difficulty_stats')) {
        const pid = values[values.length - 3];
        const gt = values[values.length - 2];
        const lvl = values[values.length - 1];
        const key = `${pid}:${gt}:${lvl}`;
        const st = tables.difficulty_stats.get(key);
        if (st) {
          if (cleanSql.includes('attempts = ?')) {
            st.attempts = Number(values[0]);
            st.total_reward = Number(values[1]);
          }
          if (cleanSql.includes('server_version = ?')) {
            const ver = cleanSql.includes('attempts = ?') ? values[2] : values[0];
            st.server_version = Number(ver);
          }
          if (cleanSql.includes("sync_status = 'synced'")) {
            st.sync_status = 'synced';
          }
          st.updated_at = new Date().toISOString();
        }
        return { changes: { changes: 1 } };
      }

      // 4. patients
      if (cleanSql.includes('INTO patients')) {
        const [
          id, name, preferred_language, caregiver_max_difficulty,
          phone, state, age, emergency_contact, emergency_phone,
          created_at, updated_at, server_version, sync_status
        ] = values;
        tables.patients.set(id, {
          id, name, preferred_language,
          caregiver_max_difficulty: Number(caregiver_max_difficulty),
          phone, state, age: Number(age),
          emergency_contact, emergency_phone,
          created_at, updated_at,
          server_version: Number(server_version) || 0,
          sync_status: sync_status || 'pending'
        });
        return { changes: { changes: 1 } };
      }

      if (cleanSql.includes('UPDATE patients')) {
        const id = values[values.length - 1];
        const p = tables.patients.get(id);
        if (p) {
          if (cleanSql.includes('caregiver_max_difficulty = ?') && values.length === 3) {
            p.caregiver_max_difficulty = Number(values[0]);
            p.updated_at = values[1];
          } else if (cleanSql.includes("sync_status = 'synced'") && values.length === 3) {
            p.sync_status = 'synced';
            p.server_version = Number(values[0]);
            p.updated_at = values[1];
          } else if (values.length >= 10) {
            p.name = values[0];
            p.preferred_language = values[1];
            p.caregiver_max_difficulty = Number(values[2]);
            p.phone = values[3];
            p.state = values[4];
            p.age = Number(values[5]);
            p.emergency_contact = values[6];
            p.emergency_phone = values[7];
            if (cleanSql.includes("sync_status = 'synced'")) {
              p.sync_status = 'synced';
              p.server_version = Number(values[8]);
              p.updated_at = values[9];
            } else {
              p.updated_at = values[8];
            }
          }
        }
        return { changes: { changes: 1 } };
      }

      // 5. sync_queue
      if (cleanSql.includes('INTO sync_queue')) {
        const [id, entity_type, entity_id, operation, payload_json, created_at, updated_at] = values;
        tables.sync_queue.set(id, {
          id, entity_type, entity_id, operation, payload_json,
          created_at, updated_at, attempts: 0, next_retry_at: null, status: 'pending', last_error: null
        });
        return { changes: { changes: 1 } };
      }

      if (cleanSql.includes('DELETE FROM sync_queue WHERE id = ?')) {
        const id = values[0];
        tables.sync_queue.delete(id);
        return { changes: { changes: 1 } };
      }

      if (cleanSql.includes('DELETE FROM sync_queue')) {
        tables.sync_queue.clear();
        return { changes: { changes: 1 } };
      }

      if (cleanSql.includes('UPDATE sync_queue')) {
        if (cleanSql.includes("status = 'failed'")) {
          const [attempts, nextRetryAt, lastError, updatedAt, id] = values;
          const q = tables.sync_queue.get(id);
          if (q) {
            q.status = 'failed';
            q.attempts = Number(attempts);
            q.next_retry_at = nextRetryAt;
            q.last_error = lastError;
            q.updated_at = updatedAt;
          }
        } else if (cleanSql.includes("status = 'pending'") && cleanSql.includes("WHERE status = 'failed'")) {
          for (const q of tables.sync_queue.values()) {
            if (q.status === 'failed') {
              q.status = 'pending';
              q.attempts = 0;
              q.next_retry_at = null;
            }
          }
        } else {
          const [payload_json, updated_at, id] = values;
          const q = tables.sync_queue.get(id);
          if (q) {
            q.payload_json = payload_json;
            q.updated_at = updated_at;
            q.status = 'pending';
            q.attempts = 0;
            q.next_retry_at = null;
          }
        }
        return { changes: { changes: 1 } };
      }

      return { changes: { changes: 0 } };
    },

    async beginTransaction() {},
    async commitTransaction() {},
    async rollbackTransaction() {},
  };
}

// ── Web / Native Initializers ────────────────────────────────────────────────

async function initWeb() {
  try {
    const wasmUrl = '/assets/sql-wasm.wasm';
    try {
      const response = await fetch(wasmUrl, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`WASM asset not available at ${wasmUrl}`);
      }
    } catch (assetErr) {
      console.warn('[db] Web SQLite WASM asset missing, using in-memory SQLite store:', assetErr.message);
      return createMemoryDb();
    }

    const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
    const { defineCustomElements } = await import('jeep-sqlite/loader');

    await defineCustomElements(window);

    if (!document.querySelector('jeep-sqlite')) {
      const jeepEl = document.createElement('jeep-sqlite');
      document.body.appendChild(jeepEl);
      await customElements.whenDefined('jeep-sqlite');
    }

    const sqliteConn = new SQLiteConnection(CapacitorSQLite);
    await sqliteConn.initWebStore();

    const db = await sqliteConn.createConnection(
      DB_NAME,
      false,
      'no-encryption',
      DB_VERSION,
      false
    );
    await db.open();
    _sqlite = sqliteConn;
    return db;
  } catch (err) {
    console.warn('[db] jeep-sqlite not available, using in-memory SQLite store:', err.message);
    return createMemoryDb();
  }
}

async function initNative() {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqliteConn = new SQLiteConnection(CapacitorSQLite);
  const db = await sqliteConn.createConnection(
    DB_NAME,
    false,
    'no-encryption',
    DB_VERSION,
    false
  );
  await db.open();
  _sqlite = sqliteConn;
  return db;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getDB() {
  if (_db) return _db;
  if (_initializing) return _initializing;

  _initializing = (async () => {
    try {
      if (process.env.NODE_ENV === 'test') {
        _db = createMemoryDb();
      } else if (isCapacitorNative()) {
        _db = await initNative();
      } else {
        _db = await initWeb();
      }
    } catch (err) {
      console.error('[db] Failed to open SQLite, falling back to in-memory store:', err);
      _db = createMemoryDb();
    }
    return _db;
  })();

  return _initializing;
}

export async function dbQuery(sql, values = []) {
  const db = await getDB();
  try {
    const result = await db.query(sql, values);
    return result.values || [];
  } catch (err) {
    console.error('[db] query error:', sql, err);
    return [];
  }
}

export async function dbRun(sql, values = []) {
  const db = await getDB();
  try {
    const result = await db.run(sql, values);
    return result.changes || { changes: 0 };
  } catch (err) {
    console.error('[db] run error:', sql, err);
    return { changes: 0 };
  }
}

export async function dbTransaction(ops) {
  const db = await getDB();
  try {
    await db.beginTransaction();
    for (const op of ops) {
      await db.run(op.sql, op.values || []);
    }
    await db.commitTransaction();
    return true;
  } catch (err) {
    console.error('[db] transaction error:', err);
    try { await db.rollbackTransaction(); } catch (_) { /* ignore */ }
    return false;
  }
}

export function getSQLiteConnection() {
  return _sqlite;
}

export function resetTestDb() {
  _db = createMemoryDb();
  _initializing = Promise.resolve(_db);
}

const dbModule = { getDB, dbQuery, dbRun, dbTransaction, createMemoryDb, resetTestDb, getSQLiteConnection };
export default dbModule;
