import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { t, getAppLanguage } from '../i18n';
import '../styles/PatientDashboard.css';
import Navigation from '../components/Navigation';
import OfflineLangAlert from '../components/OfflineLangAlert';
import { ensureCurrentPatientRegistered } from '../services/patientRegistry';

function PatientDashboard({ patient, setPatient }) {
  const navigate = useNavigate();
  const activePatient = patient || ensureCurrentPatientRegistered();
  const lang = activePatient?.language || getAppLanguage();

  if (!activePatient) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-content">
          <p className="error-message">{t(lang, 'pleaseCompleteProfile')}</p>
          <button onClick={() => navigate('/patient-setup')}>{t(lang, 'goToSetup')}</button>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('viewerRole');
    localStorage.removeItem('viewerToken');
    localStorage.removeItem('viewerPatientId');
    navigate('/role-selection');
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return t(lang, 'goodMorning');
    if (hour < 18) return t(lang, 'goodAfternoon');
    return t(lang, 'goodEvening');
  };

  const features = [
    { id: 'game', icon: '🎮', label: t(lang, 'navGames'), path: '/games', description: t(lang, 'featureGamesDesc') },
    { id: 'reminders', icon: '⏰', label: t(lang, 'navReminders'), path: '/reminders', description: t(lang, 'featureRemindersDesc') },
    { id: 'breathing', icon: '🌬️', label: t(lang, 'breathingName'), path: '/breathing', description: t(lang, 'featureBreathingDesc') },
    { id: 'ai-assistant', icon: '❤️', label: 'AI Assistant', path: '/ai-assistant', description: 'Your gentle companion for a warm conversation' },
    { id: 'emergency', icon: '🚨', label: t(lang, 'navSos'), path: '/emergency', description: t(lang, 'featureEmergencyDesc') },
    { id: 'profile', icon: '👤', label: t(lang, 'navProfile'), path: '/profile', description: t(lang, 'featureProfileDesc') },
  ];

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        <div className="dashboard-content">
          <OfflineLangAlert lang={lang} />
          
          <div className="patient-dash-topbar">
            <div className="patient-dash-badge">
              <span className="patient-badge-dot"></span>
              <span className="patient-badge-text">Patient</span>
            </div>
            <button className="patient-logout-btn" onClick={handleLogout} title="Log out and return to role selection">
              <LogOut size={16} />
              <span>Log Out</span>
            </button>
          </div>

          <div className="dashboard-header">
            <div className="greeting-section">
              <h1 className="greeting">
                {getGreeting()}, <span className="patient-name">{activePatient.name}</span>
              </h1>
              <p className="time">
                {new Date().toLocaleDateString(lang === 'en' ? 'en-US' : undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              {activePatient.patient_id && (
                <div className="patient-id">
                  <span className="patient-id-badge">
                    <span className="patient-id-label">{t(lang, 'patientId')}:</span>{' '}
                    <span className="patient-id-value">{activePatient.patient_id}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="features-grid">
            {features.map(feature => (
              <button
                key={feature.id}
                className={`feature-card${feature.id === 'ai-assistant' ? ' feature-card--ai' : ''}`}
                onClick={() => navigate(feature.path)}
              >
                <div className="feature-icon-large">{feature.icon}</div>
                <h2 className="feature-title">{feature.label}</h2>
                <p className="feature-desc">{feature.description}</p>
              </button>
            ))}
          </div>

          <div className="health-tips">
            <h3>{t(lang, 'dailyTipTitle')}</h3>
            <p>{t(lang, 'dailyTipText')}</p>
          </div>
        </div>
      </div>
      <Navigation lang={lang} />
    </div>
  );
}

export default PatientDashboard;