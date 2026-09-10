import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import WelcomePage from './pages/WelcomePage';
import RoleSelectionPage from './pages/RoleSelectionPage';
import PatientSetupPage from './pages/PatientSetupPage';
import PatientDashboard from './pages/PatientDashboard';
import GameScreen from './pages/GameScreen';
import GamesPage from './pages/GamesPage';
import BreathingExercise from './pages/BreathingExercise';
import MyProgress from './pages/MyProgress';
import ReminderScreen from './pages/ReminderScreen';
import VoiceAssistantScreen from './pages/VoiceAssistantScreen';

import EmergencyCallScreen from './pages/EmergencyCallScreen';
import ProfileScreen from './pages/ProfileScreen';
import FamilyDashboard from './pages/FamilyDashboard';
import NurseDashboard from './pages/NurseDashboard';
import LinkPatientPage from './pages/LinkPatientPage';
import FamilyMemberPage from './pages/FamilyMemberPage';
import FamilyLoginPage from './pages/FamilyLoginPage';
import NurseLoginPage from './pages/NurseLoginPage';
import AIAssistantScreen from './pages/AIAssistantScreen';
import { ensureCurrentPatientRegistered } from './services/patientRegistry';
import { prewarmBhashiniConfig } from './services/bhashiniTTS';
import './styles/App.css';

function StartupRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== '/') return;

    const savedPatient = localStorage.getItem('patientData');
    const savedRole = localStorage.getItem('userRole');

    if (savedPatient && savedRole === 'patient') {
      navigate('/dashboard', { replace: true });
    } else if (savedRole === 'family' && localStorage.getItem('currentFamilyUser')) {
      navigate('/family-dashboard', { replace: true });
    } else if (savedRole === 'nurse' && localStorage.getItem('currentNurseUser')) {
      navigate('/nurse-dashboard', { replace: true });
    }
  }, [location.pathname, navigate]);

  return null;
}

function App() {
  const [patient, setPatient] = useState(null);
  const [, setRole] = useState(null);
  const [, setTranslationVersion] = useState(0);

  useEffect(() => {
    const refreshTranslations = () => setTranslationVersion((version) => version + 1);
    window.addEventListener('memorycare-translations-ready', refreshTranslations);
    return () => window.removeEventListener('memorycare-translations-ready', refreshTranslations);
  }, []);

  useEffect(() => {
    // Load patient data from localStorage
    const savedPatient = localStorage.getItem('patientData');
    const savedRole = localStorage.getItem('userRole');
    if (savedPatient) {
      setPatient(ensureCurrentPatientRegistered());
    }
    if (savedRole) {
      setRole(savedRole);
    }
    // Pre-warm Bhashini pipeline config for faster TTS
    prewarmBhashiniConfig();
  }, []);

  return (
    <Router>
      <div className="app">
        <StartupRedirect />
        <Routes>
          <Route path="/" element={<WelcomePage />} />
          <Route path="/role-selection" element={<RoleSelectionPage setRole={setRole} />} />
          <Route path="/patient-setup" element={<PatientSetupPage setPatient={setPatient} />} />
          <Route path="/dashboard" element={<PatientDashboard patient={patient} setPatient={setPatient} />} />
          <Route path="/games" element={<GamesPage patient={patient} />} />
          <Route path="/game/:gameId" element={<GameScreen patient={patient} />} />
          <Route path="/breathing" element={<BreathingExercise />} />
          <Route path="/progress" element={<MyProgress />} />
          <Route path="/reminders" element={<ReminderScreen patient={patient} />} />
          <Route path="/voice-assistant" element={<VoiceAssistantScreen patient={patient} />} />
          <Route path="/emergency" element={<EmergencyCallScreen patient={patient} />} />
          <Route path="/profile" element={<ProfileScreen patient={patient} setPatient={setPatient} />} />
          <Route path="/family-login" element={<FamilyLoginPage />} />
          <Route path="/family-dashboard" element={<FamilyDashboard />} />
          <Route path="/nurse-login" element={<NurseLoginPage />} />
          <Route path="/nurse-dashboard" element={<NurseDashboard />} />
          <Route path="/family/link-patient" element={<LinkPatientPage />} />
          <Route path="/family/family-members" element={<FamilyMemberPage />} />
          <Route path="/ai-assistant" element={<AIAssistantScreen />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
