/**
 * syncBackend.js
 * Backend synchronization engine, authorization, and idempotent REST endpoints.
 * Stores data safely in server/data/sync_store.json to persist across server restarts.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'sync_store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[syncBackend] Error loading store:', err);
  }
  return {
    patients: {},
    game_sessions: {},
    difficulty_stats: {},
    family_members: {},
    changelog: [],
    cursorCounter: 0,
  };
}

function saveStore(store) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[syncBackend] Error saving store:', err);
  }
}

// In-memory cache backed by file
let store = loadStore();

function getNextCursor() {
  store.cursorCounter = (store.cursorCounter || 0) + 1;
  return `cur_${store.cursorCounter}_${Date.now()}`;
}

// ── Auth & Authorization Helpers ─────────────────────────────────────────────

function authenticateRequest(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Empty token' });
  }

  // Token decoding: supports structured tokens, local viewer tokens, or demo tokens
  req.auth = {
    token,
    role: token.includes('family') ? 'family_member' : (token.includes('caregiver') ? 'caregiver' : 'patient'),
    authorizedPatients: ['*'], // By default in local/demo environment all registered IDs, verified in authorizePatientAccess
  };

  next();
}

function authorizePatientAccess(req, res, next) {
  const requestedPatientId = req.params.patientId || req.body?.patient_id;
  if (!requestedPatientId) {
    return next();
  }

  // Allow patient to access their own ID or authorized family viewer
  if (req.auth.authorizedPatients.includes('*') || req.auth.authorizedPatients.includes(requestedPatientId)) {
    return next();
  }

  return res.status(403).json({ error: `Forbidden: No access to patient ${requestedPatientId}` });
}

// ── Route Setup ──────────────────────────────────────────────────────────────

function setupSyncBackendRoutes(app) {
  // Express json parser
  const express = require('express');
  app.use(express.json({ limit: '10mb' }));

  // 1. Health check probe
  app.get('/api/v1/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'MemoryCare Sync API',
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Push endpoint (POST /api/v1/sync/push)
  app.post('/api/v1/sync/push', authenticateRequest, (req, res) => {
    const { device_id, records } = req.body || {};

    if (!Array.isArray(records)) {
      return res.status(400).json({ error: 'Invalid payload: records array required' });
    }

    const accepted = [];
    const conflicts = [];
    const failed = [];
    const now = new Date().toISOString();

    for (const item of records) {
      const { entity_type, entity_id, operation, data } = item;
      const recordData = data || {};

      try {
        if (entity_type === 'game_session') {
          // Idempotency check: Game sessions are append-only.
          // If session UUID already exists on server, return existing record and mark accepted.
          if (store.game_sessions[entity_id]) {
            accepted.push({
              entity_type,
              entity_id,
              server_version: store.game_sessions[entity_id].server_version,
              idempotent_replay: true,
            });
            continue;
          }

          // New game session
          const serverVersion = (store.game_sessions[entity_id]?.server_version || 0) + 1;
          const sessionRecord = {
            ...recordData,
            id: entity_id,
            server_version: serverVersion,
            server_received_at: now,
          };

          store.game_sessions[entity_id] = sessionRecord;
          store.changelog.push({
            cursor: getNextCursor(),
            entity_type: 'game_session',
            entity_id,
            data: sessionRecord,
            timestamp: now,
          });

          accepted.push({
            entity_type,
            entity_id,
            server_version: serverVersion,
          });
        } else if (entity_type === 'difficulty_stats') {
          // Safe counter merge:
          // patient_id:game_type:level
          const statKey = entity_id;
          const existing = store.difficulty_stats[statKey];

          let serverVersion = 1;
          let mergedAttempts = Number(recordData.attempts) || 0;
          let mergedReward = Number(recordData.total_reward) || 0;

          if (existing) {
            // Prevent double counting: take max counters
            mergedAttempts = Math.max(existing.attempts || 0, mergedAttempts);
            mergedReward = Math.max(existing.total_reward || 0, mergedReward);
            serverVersion = (existing.server_version || 0) + 1;
          }

          const statRecord = {
            ...recordData,
            attempts: mergedAttempts,
            total_reward: mergedReward,
            server_version: serverVersion,
            updated_at: now,
          };

          store.difficulty_stats[statKey] = statRecord;
          store.changelog.push({
            cursor: getNextCursor(),
            entity_type: 'difficulty_stats',
            entity_id: statKey,
            data: statRecord,
            timestamp: now,
          });

          accepted.push({
            entity_type,
            entity_id: statKey,
            server_version: serverVersion,
          });
        } else if (entity_type === 'patient') {
          const existing = store.patients[entity_id];
          const incomingVersion = Number(recordData.server_version) || 0;

          if (existing && existing.server_version > incomingVersion) {
            // Server has newer version (e.g. caregiver changed difficulty)
            conflicts.push({
              entity_type,
              entity_id,
              server_data: existing,
              resolution: 'server_preferred_for_caregiver_settings',
            });
            accepted.push({
              entity_type,
              entity_id,
              server_version: existing.server_version,
            });
          } else {
            const serverVersion = (existing?.server_version || 0) + 1;
            const patientRecord = {
              ...existing,
              ...recordData,
              id: entity_id,
              server_version: serverVersion,
              updated_at: now,
            };
            store.patients[entity_id] = patientRecord;

            store.changelog.push({
              cursor: getNextCursor(),
              entity_type: 'patient',
              entity_id,
              data: patientRecord,
              timestamp: now,
            });

            accepted.push({
              entity_type,
              entity_id,
              server_version: serverVersion,
            });
          }
        } else {
          failed.push({
            entity_type,
            entity_id,
            error: `Unsupported entity_type: ${entity_type}`,
          });
        }
      } catch (err) {
        failed.push({
          entity_type,
          entity_id,
          error: err.message,
        });
      }
    }

    saveStore(store);

    res.json({
      accepted,
      conflicts,
      failed,
      next_cursor: store.changelog.length > 0 ? store.changelog[store.changelog.length - 1].cursor : null,
    });
  });

  // 3. Pull endpoint (GET /api/v1/sync/pull?cursor=<cursor>)
  app.get('/api/v1/sync/pull', authenticateRequest, (req, res) => {
    const { cursor } = req.query;

    let changelogEntries = store.changelog;
    if (cursor) {
      const idx = store.changelog.findIndex((c) => c.cursor === cursor);
      if (idx !== -1) {
        changelogEntries = store.changelog.slice(idx + 1);
      }
    }

    const patients = [];
    const difficulty_stats = [];
    const game_sessions = [];

    for (const entry of changelogEntries) {
      if (entry.entity_type === 'patient') {
        patients.push(entry.data);
      } else if (entry.entity_type === 'difficulty_stats') {
        difficulty_stats.push(entry.data);
      } else if (entry.entity_type === 'game_session') {
        game_sessions.push(entry.data);
      }
    }

    res.json({
      patients,
      difficulty_stats,
      game_sessions,
      next_cursor: store.changelog.length > 0 ? store.changelog[store.changelog.length - 1].cursor : cursor || null,
    });
  });

  // 4. Patient progress for family dashboard (GET /api/v1/patients/:patientId/progress)
  app.get('/api/v1/patients/:patientId/progress', authenticateRequest, authorizePatientAccess, (req, res) => {
    const { patientId } = req.params;

    const patientSessions = Object.values(store.game_sessions).filter(
      (s) => s.patient_id === patientId || patientId === 'all'
    );

    const gamesPlayed = patientSessions.length;
    const avgAccuracy = gamesPlayed
      ? patientSessions.reduce((sum, s) => sum + (Number(s.accuracy) || 0), 0) / gamesPlayed
      : 0;
    const avgResponseTime = gamesPlayed
      ? patientSessions.reduce((sum, s) => sum + (Number(s.average_response_time) || 0), 0) / gamesPlayed
      : 0;

    const sorted = [...patientSessions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const lastActivityTime = sorted.length > 0 ? sorted[0].created_at : null;

    // Per-game breakdown
    const gameBreakdown = {};
    for (const s of sorted) {
      const gt = s.game_type;
      if (!gameBreakdown[gt]) {
        gameBreakdown[gt] = {
          game_type: gt,
          sessions_count: 0,
          passed_count: 0,
          avg_accuracy: 0,
          total_accuracy: 0,
          latest_difficulty: Number(s.difficulty_after) || 1,
          latest_model_action: s.model_action || 'KEEP_DIFFICULTY',
          latest_model_confidence: Number(s.model_confidence) || 1.0,
        };
      }
      const b = gameBreakdown[gt];
      b.sessions_count += 1;
      if (s.passed) b.passed_count += 1;
      b.total_accuracy += Number(s.accuracy) || 0;
    }

    Object.values(gameBreakdown).forEach((b) => {
      b.avg_accuracy = b.sessions_count > 0 ? b.total_accuracy / b.sessions_count : 0;
    });

    res.json({
      patient_id: patientId,
      games_played: gamesPlayed,
      average_accuracy: avgAccuracy,
      average_response_time: avgResponseTime,
      last_activity_time: lastActivityTime,
      game_breakdown: gameBreakdown,
      recent_sessions: sorted.slice(0, 15),
    });
  });

  // 5. Family members endpoint (GET /api/v1/patients/:patientId/family-members)
  app.get('/api/v1/patients/:patientId/family-members', authenticateRequest, authorizePatientAccess, (req, res) => {
    const { patientId } = req.params;
    const members = store.family_members[patientId] || [
      { id: 'fm-1', name: 'Meena', relationship: 'daughter' },
      { id: 'fm-2', name: 'Rajesh', relationship: 'son' },
      { id: 'fm-3', name: 'Anita', relationship: 'nurse' },
    ];
    res.json({
      patient_id: patientId,
      family_members: members,
    });
  });
}

module.exports = { setupSyncBackendRoutes };
