import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Save, X, User } from 'lucide-react';
import '../styles/ProfileScreen.css';
import Navigation from '../components/Navigation';
import TopBackButton from '../components/TopBackButton';
import { t, tf, LANGUAGES, LANGUAGE_DISPLAY_ORDER, languageLabel, getAppLanguage } from '../i18n';
import { speak, setVoiceLang } from '../services/voice';
import { registerPatient } from '../services/patientRegistry';

const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal'
];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    return fallback;
  }
}

function profileStats() {
  const results = readJson('memoryCareResults', []);
  const plays = results.length;
  const accuracies = results
    .map((record) => Number(record.accuracy_percent))
    .filter((value) => !Number.isNaN(value) && value >= 0 && value <= 100);
  const averageAccuracy = accuracies.length
    ? Math.round(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length)
    : 0;
  const reminders = readJson('reminders', []);
  return { plays, averageAccuracy, reminderCount: Array.isArray(reminders) ? reminders.length : 0 };
}

function ProfileScreen({ patient, setPatient }) {
  const navigate = useNavigate();
  const [currentLang, setCurrentLang] = useState(() => patient?.language || getAppLanguage());
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(patient || {});
  const [bhashiniUpdateKey, setBhashiniUpdateKey] = useState('');
  const [bhashiniInferenceKey, setBhashiniInferenceKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);

  useEffect(() => {
    if (patient?.language) {
      setCurrentLang(patient.language);
    }
    setBhashiniUpdateKey(localStorage.getItem('bhashiniUpdateKey') || '');
    setBhashiniInferenceKey(localStorage.getItem('bhashiniInferenceKey') || '');
  }, [patient?.language]);

  if (!patient) {
    return (
      <div className="profile-page">
        <div className="profile-container">
          <p className="error">{t(currentLang, 'pleaseCompleteProfile')}</p>
          <button onClick={() => navigate('/patient-setup')}>{t(currentLang, 'setupProfile')}</button>
        </div>
      </div>
    );
  }

  const handleEdit = () => {
    setIsEditing(true);
    setEditData(patient);
  };

  const handleSave = () => {
    const langToSave = editData.language || currentLang || 'en';
    const updatedPatient = { ...patient, ...editData, language: langToSave, preferred_language: langToSave };
    localStorage.setItem('preferredLang', langToSave);
    const saved = registerPatient(updatedPatient);
    localStorage.setItem('patientData', JSON.stringify(saved));
    setCurrentLang(langToSave);
    setVoiceLang(langToSave);
    setPatient(saved);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditData(patient);
  };

  const handleLanguagePick = (code) => {
    setCurrentLang(code);
    const updatedPatient = { ...patient, language: code, preferred_language: code };
    localStorage.setItem('preferredLang', code);
    const saved = registerPatient(updatedPatient);
    localStorage.setItem('patientData', JSON.stringify(saved));
    if (setPatient) {
      setPatient(saved);
    }
    setVoiceLang(code);
    speak(languageLabel(code));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('viewerRole');
    localStorage.removeItem('viewerToken');
    localStorage.removeItem('viewerPatientId');
    navigate('/role-selection');
  };

  const handleSaveApiKeys = () => {
    const updateKey = bhashiniUpdateKey.trim();
    const inferenceKey = bhashiniInferenceKey.trim();
    if (updateKey) {
      localStorage.setItem('bhashiniUpdateKey', updateKey);
    } else {
      localStorage.removeItem('bhashiniUpdateKey');
    }
    if (inferenceKey) {
      localStorage.setItem('bhashiniInferenceKey', inferenceKey);
    } else {
      localStorage.removeItem('bhashiniInferenceKey');
    }
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="profile-content">
          <div className="top-back-row">
            <TopBackButton to="/dashboard" />
          </div>
          <div className="profile-header">
            <h1 className="profile-title">{t(currentLang, 'myProfile')}</h1>
            <p className="profile-subtitle">{t(currentLang, 'profileSubtitle')}</p>
          </div>

          <div className="profile-avatar">
            <User size={80} />
          </div>

          {!isEditing ? (
            <div className="profile-info">
              <div className="info-section">
                <div className="info-item patient-id-item">
                  <span className="info-label">{t(currentLang, 'patientId')}</span>
                  <span className="info-value">{patient.patient_id || '—'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t(currentLang, 'profileName')}</span>
                  <span className="info-value">{patient.name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t(currentLang, 'profileAge')}</span>
                  <span className="info-value">
                    {patient.age ? tf(currentLang, 'yearsOld', { n: patient.age }) : '—'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t(currentLang, 'profilePhone')}</span>
                  <span className="info-value">{patient.phone || t(currentLang, 'notSet')}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t(currentLang, 'profileState')}</span>
                  <span className="info-value">{patient.state || t(currentLang, 'notSet')}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t(currentLang, 'emergencyContact')}</span>
                  <span className="info-value">{patient.emergencyContact || patient.emergency_contact || t(currentLang, 'notSet')}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">{t(currentLang, 'emergencyPhone')}</span>
                  <span className="info-value">{patient.emergencyPhone || patient.emergency_phone || t(currentLang, 'notSet')}</span>
                </div>
              </div>

              <div className="profile-stats">
                <div className="stat-card">
                  <span className="stat-icon">🎮</span>
                  <span className="stat-title">{t(currentLang, 'gamesPlayed')}</span>
                  <span className="stat-value">{profileStats().plays}</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">🎯</span>
                  <span className="stat-title">{t(currentLang, 'averageAccuracy')}</span>
                  <span className="stat-value">{profileStats().averageAccuracy}%</span>
                </div>
                <div className="stat-card">
                  <span className="stat-icon">⏰</span>
                  <span className="stat-title">{t(currentLang, 'remindersCount')}</span>
                  <span className="stat-value">{profileStats().reminderCount}</span>
                </div>
              </div>

              <div className="profile-language">
                <h3 className="profile-language-title">
                  {t(currentLang, 'changeLanguage')}
                </h3>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <select
                    id="profile-lang-select"
                    className="form-input"
                    value={currentLang || 'en'}
                    onChange={(e) => handleLanguagePick(e.target.value)}
                    aria-label={t(currentLang, 'changeLanguage')}
                  >
                    {(LANGUAGE_DISPLAY_ORDER || LANGUAGES).map((code) => (
                      <option key={code} value={code}>
                        {languageLabel(code)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="profile-api-keys">
                <h3 className="profile-language-title">🔑 {t(currentLang, 'apiKeysTitle')}</h3>
                <div className="form-group">
                  <label htmlFor="bhashini-update-key">{t(currentLang, 'bhashiniUpdateKey')}</label>
                  <input
                    id="bhashini-update-key"
                    type="password"
                    placeholder="e.g. 4056de1605-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={bhashiniUpdateKey}
                    onChange={(e) => setBhashiniUpdateKey(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="bhashini-inference-key">{t(currentLang, 'bhashiniInferenceKey')}</label>
                  <input
                    id="bhashini-inference-key"
                    type="password"
                    placeholder="e.g. inference api key"
                    value={bhashiniInferenceKey}
                    onChange={(e) => setBhashiniInferenceKey(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="api-keys-actions">
                  <button
                    type="button"
                    className="save-btn"
                    onClick={handleSaveApiKeys}
                  >
                    {apiKeySaved ? `✓ ${t(currentLang, 'saved')}` : t(currentLang, 'saveApiKeys')}
                  </button>
                  {apiKeySaved && (
                    <span className="api-keys-saved-msg">{t(currentLang, 'apiKeysSaved')}</span>
                  )}
                </div>
                <p className="api-keys-hint">
                  {t(currentLang, 'apiKeysHint')}
                </p>
              </div>

              <button className="edit-btn" onClick={handleEdit}>
                <Edit2 size={24} />
                {t(currentLang, 'editProfile')}
              </button>
            </div>
          ) : (
            <form className="edit-form">
              <div className="form-group">
                <label>{t(currentLang, 'profileName')}</label>
                <input
                  type="text"
                  name="name"
                  value={editData.name || ''}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>{t(currentLang, 'profileAge')}</label>
                <input
                  type="number"
                  name="age"
                  value={editData.age || ''}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>{t(currentLang, 'profilePhone')}</label>
                <input
                  type="tel"
                  name="phone"
                  value={editData.phone || ''}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>{t(currentLang, 'profileState')}</label>
                <select
                  name="state"
                  value={editData.state || ''}
                  onChange={handleChange}
                  className="form-input"
                >
                  <option value="" disabled>{t(currentLang, 'selectYourState')}</option>
                  {INDIAN_STATES.map((state) => (
                    <option key={state} value={state}>{state}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>🌐 {t(currentLang, 'language')}</label>
                <select
                  name="language"
                  value={editData.language || currentLang || 'en'}
                  onChange={handleChange}
                  className="form-input"
                >
                  {(LANGUAGE_DISPLAY_ORDER || LANGUAGES).map((code) => (
                    <option key={code} value={code}>
                      {languageLabel(code)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>{t(currentLang, 'emergencyContact')}</label>
                <input
                  type="text"
                  name="emergencyContact"
                  value={editData.emergencyContact || editData.emergency_contact || ''}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
              <div className="form-group">
                <label>{t(currentLang, 'emergencyPhone')}</label>
                <input
                  type="tel"
                  name="emergencyPhone"
                  value={editData.emergencyPhone || editData.emergency_phone || ''}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>

              <div className="edit-buttons">
                <button type="button" className="save-btn" onClick={handleSave}>
                  <Save size={24} />
                  {t(currentLang, 'saveChanges')}
                </button>
                <button type="button" className="cancel-btn" onClick={handleCancel}>
                  <X size={24} />
                  {t(currentLang, 'cancel')}
                </button>
              </div>
            </form>
          )}

          <div className="profile-actions">
            <button className="logout-btn" onClick={handleLogout}>
              {t(currentLang, 'signOut')}
            </button>
          </div>

          <div className="profile-footer">
            <p>
              {patient.createdAt
                ? tf(currentLang, 'lastUpdated', {
                    date: new Date(patient.createdAt).toLocaleDateString(currentLang === 'en' ? 'en-US' : undefined),
                  })
                : null}
            </p>
          </div>
        </div>
      </div>
      <Navigation lang={currentLang} />
    </div>
  );
}

export default ProfileScreen;
