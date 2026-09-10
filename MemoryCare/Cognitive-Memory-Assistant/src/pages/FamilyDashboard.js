import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Clock, TrendingUp, RefreshCw, Users, User,
  Image as ImageIcon, Bell, Link2, Loader, LogOut,
} from 'lucide-react';
import '../styles/FamilyDashboard.css';
import viewerApi, {
  getSelectedPatientId,
  selectPatient,
} from '../services/viewerApi';
import gameRepository from '../services/gameRepository';

const GAME_LABELS = {
  shape_sort: 'Shape Sort',
  pattern_matching: 'Pattern Match',
  face_name_recall: 'Face-Name Recall',
  remember_my_story: 'Story Recall',
  'memory-match': 'Memory Match',
  spot_difference: 'Spot Difference',
  reorder_day: 'Reorder Day',
  what_comes_next: 'What Comes Next',
};

const REMINDER_TYPE_LABELS = {
  medicine: 'Medicine',
  hydration: 'Hydration',
  activity: 'Activity',
  appointment: 'Appointment',
  other: 'Other',
};

function gameLabel(gameId) {
  return GAME_LABELS[gameId] || gameId || 'Game';
}

function formatAccuracy(acc) {
  const v = Number(acc);
  return Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—';
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch (error) {
    return '—';
  }
}

function formatDateOnly(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (error) {
    return '—';
  }
}

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Number(seconds);
  if (!Number.isFinite(s)) return '—';
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

const TABS = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'history', label: 'Game History', icon: Clock },
  { key: 'reminders', label: 'Reminders', icon: Bell },
  { key: 'family', label: 'Family Photos', icon: ImageIcon },
];

function FamilyDashboard() {
  const navigate = useNavigate();
  const patientId = getSelectedPatientId();
  const [linkedPatients, setLinkedPatients] = useState([]);
  const [selectedId, setSelectedId] = useState(patientId || '');
  const [activeTab, setActiveTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [gameResults, setGameResults] = useState(null);
  const [reminders, setReminders] = useState([]);
  const [members, setMembers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeAlert, setActiveAlert] = useState(() => {
    try {
      const raw = localStorage.getItem('activeEmergencyAlert');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const check = () => {
      try {
        const raw = localStorage.getItem('activeEmergencyAlert');
        setActiveAlert(raw ? JSON.parse(raw) : null);
      } catch {}
    };
    const interval = setInterval(check, 2500);
    return () => clearInterval(interval);
  }, []);

  const ensureSession = useCallback(async () => {
    await viewerApi.ensureSession('family');
  }, []);

  const loadLinked = useCallback(async () => {
    try {
      await ensureSession();
      const list = await viewerApi.getLinkedPatients();
      setLinkedPatients(list);
      if (!selectedId && list.length) {
        const first = list[0].patient_id;
        setSelectedId(first);
        selectPatient(first);
      }
    } catch (e) {
      setError(e.message || 'Could not load linked patients.');
    }
  }, [ensureSession, selectedId]);

  const loadAll = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    setError('');
    try {
      await ensureSession();
      const [ov, results, rms, mems] = await Promise.all([
        viewerApi.getPatientOverview(selectedId),
        viewerApi.getPatientGameResults(selectedId, { per_page: 20 }),
        viewerApi.getPatientReminders(selectedId, true),
        viewerApi.listFamilyMembers(selectedId),
      ]);
      setOverview(ov);
      setGameResults(results);
      setReminders(rms);
      setMembers(mems);
    } catch (e) {
      setError(e.message || 'Could not load patient data.');
    } finally {
      setLoading(false);
    }
  }, [ensureSession, selectedId]);

  useEffect(() => {
    loadLinked();
  }, [loadLinked]);

  useEffect(() => {
    if (selectedId) loadAll();
  }, [selectedId, loadAll]);

  const handlePatientChange = (e) => {
    const next = e.target.value;
    setSelectedId(next);
    selectPatient(next);
  };

  const handleRetry = () => {
    loadAll();
  };

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('currentFamilyUser');
    localStorage.removeItem('viewerRole');
    localStorage.removeItem('viewerToken');
    localStorage.removeItem('viewerPatientId');
    navigate('/role-selection');
  };

  const goToLink = () => navigate('/family/link-patient');
  const goToFamilyMembers = () => navigate('/family/family-members');

  if (!selectedId && !loading) {
    return (
      <div className="family-page">
        <div className="family-dash-header">
          <div>
            <h1 className="family-dash-title">Family Dashboard</h1>
            <p className="family-dash-subtitle">Stay connected with your loved one's cognitive journey</p>
          </div>
          <div className="family-header-actions">
            <button className="family-header-btn secondary" onClick={handleLogout} title="Log Out">
              <LogOut size={16} /> Log Out
            </button>
          </div>
        </div>
        <div className="family-empty-state">
          <Users size={40} />
          <h2>Connect a patient</h2>
          <p>Link a patient to view their progress, game history, reminders, and more.</p>
          <button className="family-connect-btn" onClick={goToLink}>
            <Link2 size={18} /> Connect Patient
          </button>
        </div>
      </div>
    );
  }

  const patient = linkedPatients.find((p) => p.patient_id === selectedId);
  const percent = overview && overview.overall_progress ? overview.overall_progress.percent : 0;
  const gamesPlayed = overview && overview.overall_progress ? overview.overall_progress.games_played : 0;

  const currentFamilyUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('currentFamilyUser'));
    } catch (e) {
      return null;
    }
  })();

  return (
    <div className="family-page">
      <div className="family-dash-header">
        <div>
          <h1 className="family-dash-title">Family Dashboard</h1>
          <p className="family-dash-subtitle">
            {patient ? `${patient.name} 's cognitive progress` : "Loved one's cognitive progress"}
          </p>
          {currentFamilyUser && (
            <div className="family-user-indicator">
              <span>👤 Caregiver: <strong>{currentFamilyUser.name}</strong> ({currentFamilyUser.relation})</span>
            </div>
          )}
        </div>
        <div className="family-header-actions">
          <button className="family-header-btn secondary" onClick={handleLogout} title="Log Out">
            <LogOut size={16} /> Log Out
          </button>
          <button className="family-header-btn" onClick={goToLink}>
            <Link2 size={16} /> Connect
          </button>
          <button className="family-header-btn" onClick={handleRetry} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {activeAlert && (
        <div style={{
          background: '#FFEBEE',
          border: '2px solid #D32F2F',
          borderRadius: '12px',
          padding: '14px 18px',
          margin: '0 0 20px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          boxShadow: '0 4px 14px rgba(211,47,47,0.25)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '32px' }}>🚨</span>
            <div>
              <strong style={{ color: '#B71C1C', fontSize: '16px' }}>URGENT: PATIENT EMERGENCY ALERT TRIGGERED</strong>
              <div style={{ color: '#333', fontSize: '14px', marginTop: '3px', lineHeight: '1.4' }}>
                Patient <strong>{activeAlert.patientName}</strong> (ID: {activeAlert.patientId}) initiated an emergency call to <strong>{activeAlert.serviceName} ({activeAlert.number})</strong> at {new Date(activeAlert.timestamp).toLocaleTimeString()}
                {activeAlert.state && ` · Location: ${activeAlert.state}`}
              </div>
            </div>
          </div>
          <button 
            style={{
              background: '#D32F2F',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontWeight: '700',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
            onClick={() => {
              localStorage.removeItem('activeEmergencyAlert');
              setActiveAlert(null);
            }}
          >
            Acknowledge
          </button>
        </div>
      )}

      {error && (
        <div className="family-error">
          <p>{error}</p>
          <button onClick={handleRetry}>Retry</button>
        </div>
      )}

      {linkedPatients.length > 1 && (
        <div className="family-patient-select">
          <label htmlFor="family-patient-picker">Patient (select by ID)</label>
          <select id="family-patient-picker" value={selectedId} onChange={handlePatientChange}>
            {linkedPatients.map((p) => (
              <option key={p.patient_id} value={p.patient_id}>
                {p.patient_id} · {p.name} · {p.age} yrs · {p.preferred_language}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="family-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`family-tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="family-loading"><Loader size={24} className="spin" /> Loading…</div>
      ) : (
        <div className="family-content">
          {activeTab === 'overview' && (
            <OverviewTab
              overview={overview}
              patient={patient}
              percent={percent}
              gamesPlayed={gamesPlayed}
            />
          )}

          {activeTab === 'history' && (
            <HistoryTab gameResults={gameResults} />
          )}

          {activeTab === 'reminders' && (
            <RemindersTab reminders={reminders} />
          )}

          {activeTab === 'family' && (
            <div className="family-tab-family">
              <button className="family-manage-btn" onClick={goToFamilyMembers}>
                <ImageIcon size={18} /> Manage Family Photos
              </button>
              {members.length === 0 ? (
                <p className="family-muted">
                  No family photos added yet. Add photos to help your loved one recognise you.
                </p>
              ) : (
                <div className="family-tab-member-list">
                  {members.map((m) => (
                    <div className="family-tab-member" key={m.id}>
                      {m.photo_url ? (
                        <img src={m.photo_url} alt={m.name} />
                      ) : (
                        <div className="family-tab-member-ph"><User size={24} /></div>
                      )}
                      <strong>{m.name}</strong>
                      <span>{m.relationship}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OverviewTab({ overview, patient, percent, gamesPlayed }) {
  if (!overview) {
    return <p className="family-muted">No data available yet.</p>;
  }
  const improvement = overview.improvement_percentage;
  return (
    <div className="family-overview">
      {patient && (
        <div className="family-profile-card">
          <div className="family-profile-avatar"><User size={32} /></div>
          <div className="family-profile-info">
            <strong>{patient.name}</strong>
            <span>{patient.age} yrs · Lang: {patient.preferred_language}</span>
            <span>Phone: {patient.phone || 'N/A'} · State: {patient.state || 'N/A'}</span>
            <span>Emergency: {patient.emergency_contact || 'N/A'} ({patient.emergency_phone || 'N/A'})</span>
            <span className="family-profile-id">ID: {patient.patient_id}</span>
          </div>
        </div>
      )}

      <div className="family-overview-grid">
        <div className="family-overview-stat">
          <Activity size={20} />
          <div>
            <span>Games played</span>
            <strong>{gamesPlayed}</strong>
          </div>
        </div>
        <div className="family-overview-stat">
          <TrendingUp size={20} />
          <div>
            <span>Avg accuracy</span>
            <strong>{formatAccuracy(overview.overall_progress.avg_accuracy)}</strong>
          </div>
        </div>
        <div className="family-overview-stat">
          <Clock size={20} />
          <div>
            <span>Avg time per game</span>
            <strong>{formatTime(overview.overall_progress.avg_time_seconds)}</strong>
          </div>
        </div>
      </div>

      <div className="family-panel">
        <h3>Overall progress</h3>
        <div className="family-progress-track">
          <div className="family-progress-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
        <p className="family-progress-caption">
          {percent}% overall accuracy
          {improvement !== null && improvement !== undefined && (
            <span className={improvement >= 0 ? 'family-trend-up' : 'family-trend-down'}>
              {' '}↗/↘ {Math.abs(improvement).toFixed(1)}% vs previous week
            </span>
          )}
        </p>
      </div>

      {overview.trend && overview.trend.length > 0 && (
        <div className="family-panel">
          <h3>Recent activity trend</h3>
          <div className="family-trend-bars">
            {overview.trend.map((t) => (
              <div className="family-trend-bar" key={t.date} title={`${t.date}: ${t.sessions} session(s)`}>
                <div className="family-trend-bar-fill" style={{ height: `${Math.min(100, Math.max(4, t.avg_accuracy * 100))}%` }} />
                <span>{new Date(t.date).getDate()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="family-panel">
        <h3>Highest level reached by category</h3>
        {overview.highest_levels.length === 0 ? (
          <p className="family-muted">No game data yet.</p>
        ) : (
          <div className="family-level-chips">
            {overview.highest_levels.map((h) => (
              <span className="family-level-chip" key={h.category}>
                {h.category}: Level {h.highest_level}
                <em>{formatAccuracy(h.avg_accuracy)} avg</em>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryTab({ gameResults }) {
  const [offlineRecords, setOfflineRecords] = useState([]);
  const [caregiverCaps, setCaregiverCaps] = useState({
    pattern_matching: 4,
    shape_sort: 4,
    face_name_recall: 4,
    remember_my_story: 4,
  });

  useEffect(() => {
    (async () => {
      try {
        const records = await gameRepository.listSessions();
        setOfflineRecords(records.reverse());
        const caps = await gameRepository.getAllCaregiverMaxDifficulties();
        setCaregiverCaps(caps);
      } catch (e) {
        console.warn('Error loading offline history/caps', e);
      }
    })();
  }, []);

  const handleCapChange = async (gameType, newCap) => {
    const val = Number(newCap);
    await gameRepository.setCaregiverMaxDifficulty(gameType, val);
    setCaregiverCaps((prev) => ({ ...prev, [gameType]: val }));
  };

  const results = gameResults && gameResults.game_results ? gameResults.game_results : [];
  const combined = offlineRecords.length > 0 ? offlineRecords : results.map((g) => ({
    id: g.id,
    game_type: g.game_id,
    difficulty_before: g.difficulty,
    difficulty_after: g.difficulty,
    accuracy: g.accuracy,
    average_response_time: g.response_time,
    timestamp: g.played_at,
    model_action: 'KEEP_DIFFICULTY',
    model_confidence: 1.0,
    decision_reason: 'Baseline completed session',
  }));

  return (
    <>
      <div className="family-panel" style={{ marginBottom: '20px' }}>
        <h3>Caregiver Adaptive Settings (Max Level Ceiling)</h3>
        <p className="family-muted" style={{ marginBottom: '14px' }}>
          Configure maximum difficulty levels per cognitive game. The AI model will never increase a patient's game difficulty beyond the configured ceiling.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
          {[
            { id: 'pattern_matching', label: 'Find the Match' },
            { id: 'shape_sort', label: 'Shape Sort' },
            { id: 'face_name_recall', label: 'Face & Name' },
            { id: 'remember_my_story', label: 'Story Recall' },
          ].map((game) => (
            <div key={game.id} style={{ background: '#F8F6F2', padding: '12px 14px', borderRadius: '10px', border: '1px solid #EAD8C7' }}>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '6px', color: '#2B2B2E' }}>{game.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: '#6E6A67' }}>Max Level:</span>
                <select
                  value={caregiverCaps[game.id] || 4}
                  onChange={(e) => handleCapChange(game.id, e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #D85A30',
                    background: '#fff',
                    fontWeight: 600,
                    color: '#D85A30',
                    cursor: 'pointer',
                  }}
                >
                  <option value={1}>Level 1 (Easy)</option>
                  <option value={2}>Level 2 (Gentle)</option>
                  <option value={3}>Level 3 (Moderate)</option>
                  <option value={4}>Level 4 (Standard Max)</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="family-panel">
        <h3>Adaptive Gameplay History & Explainable Decisions</h3>
        {combined.length === 0 ? (
          <p className="family-muted">No games played yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="family-game-table">
              <thead>
                <tr>
                  <th>Game</th>
                  <th>Level Transition</th>
                  <th>Accuracy</th>
                  <th>AI Decision</th>
                  <th>Confidence</th>
                  <th>Explainability Reason</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {combined.map((g) => (
                  <tr key={g.id}>
                    <td><strong>{gameLabel(g.game_type)}</strong></td>
                    <td>
                      {g.difficulty_before === g.difficulty_after ? (
                        `Level ${g.difficulty_before || 1}`
                      ) : (
                        <span>
                          Level {g.difficulty_before || 1} &rarr; <strong>Level {g.difficulty_after || 1}</strong>
                        </span>
                      )}
                    </td>
                    <td>{formatAccuracy(g.accuracy)}</td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: g.model_action === 'INCREASE_DIFFICULTY' ? '#E8F5E9' : g.model_action === 'DECREASE_DIFFICULTY' ? '#FFF3E0' : '#EDE7F6',
                        color: g.model_action === 'INCREASE_DIFFICULTY' ? '#2E7D32' : g.model_action === 'DECREASE_DIFFICULTY' ? '#E65100' : '#4527A0',
                      }}>
                        {g.model_action || 'KEEP_DIFFICULTY'}
                      </span>
                    </td>
                    <td>{g.model_confidence != null ? `${Math.round(Number(g.model_confidence) * 100)}%` : '—'}</td>
                    <td style={{ maxWidth: '320px', fontSize: '12px', color: '#555', lineHeight: '1.35' }}>
                      {g.decision_reason || 'Evaluated via cognitive performance policy'}
                    </td>
                    <td>{formatDate(g.timestamp || g.played_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function RemindersTab({ reminders }) {
  return (
    <div className="family-panel">
      <h3>Active reminders</h3>
      {reminders.length === 0 ? (
        <p className="family-muted">No active reminders.</p>
      ) : (
        <div className="family-reminder-list">
          {reminders.map((r) => (
            <div className="family-reminder-item" key={r.reminder_id}>
              <div className="family-reminder-icon">
                {r.reminder_type === 'medicine' ? '💊' : r.reminder_type === 'hydration' ? '💧' : r.reminder_type === 'appointment' ? '📅' : '⏰'}
              </div>
              <div className="family-reminder-main">
                <strong>{r.title}</strong>
                <span>{REMINDER_TYPE_LABELS[r.reminder_type] || r.reminder_type} · {r.frequency}{r.time_of_day ? ` at ${r.time_of_day}` : ''}</span>
              </div>
              <span className="family-reminder-date">since {formatDateOnly(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FamilyDashboard;
