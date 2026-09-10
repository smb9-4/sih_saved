import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock, TrendingUp, RefreshCw, Users, LogOut } from 'lucide-react';
import '../styles/ViewerInsights.css';
import TopBackButton from './TopBackButton';
import viewerApi, {
  getSelectedPatientId,
  selectPatient,
} from '../services/viewerApi';

const GAME_LABELS = {
  shape_sort: 'Shape Sort',
  pattern_matching: 'Pattern Match',
  face_name_recall: 'Face-Name Recall',
  remember_my_story: 'Story Recall',
  'memory-match': 'Memory Match',
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

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Number(seconds);
  if (!Number.isFinite(s)) return '—';
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function ViewerInsights({ role }) {
  const navigate = useNavigate();
  const currentNurseUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('currentNurseUser'));
    } catch (e) {
      return null;
    }
  })();

  const [patients, setPatients] = useState([]);
  const [patientsError, setPatientsError] = useState('');
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState('');
  const [selectedId, setSelectedId] = useState(getSelectedPatientId() || '');
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const roleLabel = role === 'nurse' ? 'Nurse' : 'Family';

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('viewerRole');
    localStorage.removeItem('viewerToken');
    localStorage.removeItem('viewerPatientId');
    if (role === 'family') localStorage.removeItem('currentFamilyUser');
    if (role === 'nurse') localStorage.removeItem('currentNurseUser');
    navigate('/role-selection');
  };

  const ensureViewerSession = useCallback(async (force = false) => {
    await viewerApi.ensureSession(role, force);
  }, [role]);

  const loadPatients = useCallback(async () => {
    setLoadingPatients(true);
    setPatientsError('');
    try {
      await ensureViewerSession();
      const list = await viewerApi.listPatients();
      setPatients(list);
      const saved = getSelectedPatientId();
      if (saved && list.some((p) => p.patient_id === saved)) {
        setSelectedId(saved);
      } else {
        setSelectedId(list.length ? list[0].patient_id : '');
        if (list.length) selectPatient(list[0].patient_id);
      }
    } catch (error) {
      setPatientsError(error.message || 'Could not load patients.');
    } finally {
      setLoadingPatients(false);
    }
  }, [ensureViewerSession]);

  const loadOverview = useCallback(async (patientId) => {
    if (!patientId) return;
    setLoadingOverview(true);
    setOverviewError('');
    try {
      await ensureViewerSession();
      const data = await viewerApi.getOverview(patientId);
      setOverview(data);
      selectPatient(patientId);
    } catch (error) {
      setOverviewError(error.message || 'Could not load patient progress.');
    } finally {
      setLoadingOverview(false);
    }
  }, [ensureViewerSession]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  useEffect(() => {
    if (selectedId) {
      loadOverview(selectedId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPatient = (id) => {
    setSelectedId(id);
    setQuery('');
    setOpen(false);
    selectPatient(id);
    loadOverview(id);
  };

  const selectedPatient = patients.find((p) => p.patient_id === selectedId) || null;
  const queryLower = query.trim().toLowerCase();
  const filteredPatients = queryLower
    ? patients.filter((p) =>
        `${p.patient_id} ${p.name} ${p.age} ${p.gender} ${p.preferred_language}`.toLowerCase().includes(queryLower)
      )
    : patients;

  const handleRetry = () => {
    ensureViewerSession(true)
      .then(loadPatients)
      .then(() => (selectedId ? loadOverview(selectedId) : null))
      .catch((error) => setPatientsError(error.message || 'Could not reconnect.'));
  };

  const percent = overview && overview.overall_progress ? overview.overall_progress.percent : 0;
  const gamesPlayed = overview && overview.overall_progress ? overview.overall_progress.games_played : 0;

  return (
    <div className="viewer-page">
      <div className="top-back-row">
        <TopBackButton to="/role-selection" />
      </div>
      <div className="viewer-header">
        <div>
          <h1 className="viewer-title">{roleLabel} Dashboard</h1>
          <p className="viewer-subtitle">Patient progress & cognitive game performance</p>
          {role === 'nurse' && currentNurseUser && (
            <div className="nurse-user-badge">
              <span>🩺 Nurse: <strong>{currentNurseUser.name}</strong> ({currentNurseUser.hospitalName})</span>
            </div>
          )}
        </div>
        <div className="viewer-header-actions">
          {role === 'nurse' && (
            <button className="viewer-switch-btn" onClick={() => navigate('/nurse-login')} title="Switch Account or Login">
              <LogOut size={16} /> Switch Account
            </button>
          )}
          <button className="viewer-switch-btn" onClick={handleLogout} title="Log out">
            <LogOut size={16} /> Log out
          </button>
          <button className="viewer-refresh" onClick={handleRetry} disabled={loadingPatients || loadingOverview}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {patientsError && (
        <div className="viewer-error">
          <p>{patientsError}</p>
          <button onClick={handleRetry}>Reconnect</button>
        </div>
      )}

      <div className="viewer-patient-select">
        <label htmlFor="viewer-patient-picker">Search / select patient</label>
        <input
          id="viewer-patient-picker"
          className="viewer-patient-search"
          type="text"
          value={query || (selectedPatient ? `${selectedPatient.name} · ${selectedPatient.age} (${selectedPatient.gender})` : '')}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          placeholder={patients.length ? 'Type a name or patient ID…' : (loadingPatients ? 'Loading…' : 'No patients registered')}
          disabled={!patients.length}
          autoComplete="off"
        />
        {selectedPatient && !query && (
          <div className="viewer-id-badge">Patient ID: <strong>{selectedPatient.patient_id}</strong></div>
        )}
        {open && patients.length > 0 && (
          filteredPatients.length === 0 ? (
            <div className="viewer-search-empty">No patient matches “{query}”</div>
          ) : (
            <ul className="viewer-search-list">
              {filteredPatients.map((p) => (
                <li key={p.patient_id}>
                  <button
                    type="button"
                    className={p.patient_id === selectedId ? 'active' : ''}
                    onClick={() => pickPatient(p.patient_id)}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <span className="viewer-id-badge">Patient ID: <strong>{p.patient_id}</strong></span>
                    <span className="viewer-patient-line">
                      {p.name} · {p.age} ({p.gender}) · {p.preferred_language}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </div>

      {overviewError && <p className="viewer-error">{overviewError}</p>}

      {overview && (
        <div className="viewer-content">
          <div className="overview-grid">
            <div className="overview-stat">
              <Activity size={20} />
              <div>
                <span className="overview-stat-label">Games played</span>
                <strong>{gamesPlayed}</strong>
              </div>
            </div>
            <div className="overview-stat">
              <TrendingUp size={20} />
              <div>
                <span className="overview-stat-label">Average accuracy</span>
                <strong>{formatAccuracy(overview.overall_progress.avg_accuracy)}</strong>
              </div>
            </div>
            <div className="overview-stat">
              <Clock size={20} />
              <div>
                <span className="overview-stat-label">Avg time per game</span>
                <strong>{formatTime(overview.overall_progress.avg_time_seconds)}</strong>
              </div>
            </div>
          </div>

          <div className="overview-panel">
            <h3>Overall progress</h3>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
            </div>
            <p className="progress-caption">
              {percent}% overall accuracy
              {overview.improvement_percentage !== null && overview.improvement_percentage !== undefined && (
                <span className={overview.improvement_percentage >= 0 ? 'trend-up' : 'trend-down'}>
                  {' '}↗/↘ {Math.abs(overview.improvement_percentage).toFixed(1)}% vs previous week
                </span>
              )}
            </p>
          </div>

          <div className="overview-panel">
            <h3>Highest level reached</h3>
            {overview.highest_levels.length === 0 ? (
              <p className="muted">No game data yet.</p>
            ) : (
              <div className="level-chips">
                {overview.highest_levels.map((h) => (
                  <span className="level-chip" key={h.category}>
                    {h.category}: Level {h.highest_level}
                    <em>{formatAccuracy(h.avg_accuracy)} avg</em>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="overview-panel">
            <h3>Recent played games</h3>
            {overview.recent_games.length === 0 ? (
              <p className="muted">No games played yet.</p>
            ) : (
              <table className="game-table">
                <thead>
                  <tr>
                    <th>Game</th>
                    <th>Level</th>
                    <th>Accuracy</th>
                    <th>Time taken</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.recent_games.map((g) => (
                    <tr key={g.id}>
                      <td>{gameLabel(g.game_id)}</td>
                      <td>L{g.difficulty}</td>
                      <td>{formatAccuracy(g.accuracy)}</td>
                      <td>{formatTime(g.response_time)}</td>
                      <td>{formatDate(g.played_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="overview-panel">
            <h3>Time taken to complete each game</h3>
            {overview.time_by_game.length === 0 ? (
              <p className="muted">No timing data yet.</p>
            ) : (
              overview.time_by_game.map((t) => (
                <div className="time-row" key={t.game_id}>
                  <div className="time-row-main">
                    <strong>{gameLabel(t.game_id)}</strong>
                    <span>{t.sessions} game{t.sessions === 1 ? '' : 's'}</span>
                  </div>
                  <span className="time-row-value">
                    Avg {formatTime(t.avg_time_seconds)} · Total {formatTime(t.total_time_seconds)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {!overview && !overviewError && (
        <div className="viewer-empty">
          <Users size={32} />
          <p>{loadingOverview ? 'Loading patient progress…' : projectsMessage(role, patients.length)}</p>
        </div>
      )}
    </div>
  );
}

function projectsMessage(role, count) {
  if (count === 0) return 'Register a patient first, then their progress will appear here.';
  return `Select a patient to view their ${role} progress.`;
}

export default ViewerInsights;