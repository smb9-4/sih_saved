import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, User, Phone, Hash, HeartHandshake, Lock,
  CheckCircle, ArrowLeft, AlertCircle, Eye, EyeOff, LogIn, ArrowRight
} from 'lucide-react';
import '../styles/FamilyLoginPage.css';
import viewerApi, { selectPatient } from '../services/viewerApi';
import { registerPatient, findRegisteredPatient } from '../services/patientRegistry';

const RELATIONS = [
  'Daughter',
  'Son',
  'Spouse',
  'Mother',
  'Father',
  'Sister',
  'Brother',
  'Granddaughter',
  'Grandson',
  'Caregiver',
  'Guardian',
  'Other'
];

function FamilyLoginPage() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [patientId, setPatientId] = useState('');
  const [relation, setRelation] = useState('Daughter');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Login mode states
  const [loginIdentifier, setLoginIdentifier] = useState(''); // phone or patient ID
  const [loginPin, setLoginPin] = useState('');

  // UI state
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePinChange = (value, setter) => {
    // Only accept numeric digits, maximum 4 digits
    const cleaned = value.replace(/\D/g, '').slice(0, 4);
    setter(cleaned);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedPatientId = patientId.trim().toUpperCase();

    if (!trimmedName) {
      setError('Please enter your full name.');
      return;
    }
    if (!trimmedPhone || trimmedPhone.replace(/\D/g, '').length < 7) {
      setError('Please enter a valid phone number.');
      return;
    }
    if (!trimmedPatientId) {
      setError('Please enter or select a Patient ID.');
      return;
    }
    if (!relation) {
      setError('Please select your relationship to the patient.');
      return;
    }
    if (pin.length !== 4) {
      setError('Please enter a 4-digit code.');
      return;
    }
    if (confirmPin.length !== 4) {
      setError('Please confirm your 4-digit code.');
      return;
    }
    if (pin !== confirmPin) {
      setError('4-digit codes do not match. Please verify your confirmation code.');
      return;
    }

    setLoading(true);

    try {
      // 1. Ensure patient exists in registry; if not, create a placeholder record
      let patient = findRegisteredPatient(trimmedPatientId);
      if (!patient) {
        patient = registerPatient({
          patient_id: trimmedPatientId,
          name: `Patient (${trimmedPatientId})`,
          age: 70,
          preferred_language: 'en',
          emergency_contact: `${trimmedName} (${relation})`,
          emergency_phone: trimmedPhone
        });
      }

      // 2. Save family user to stored accounts
      const existingAccounts = JSON.parse(localStorage.getItem('familyAccounts') || '[]');
      const newAccount = {
        id: `fam-${Date.now()}`,
        name: trimmedName,
        phone: trimmedPhone,
        patientId: trimmedPatientId,
        relation,
        pin,
        createdAt: new Date().toISOString()
      };

      // Replace or append
      const updatedAccounts = existingAccounts.filter(
        (a) => !(a.phone === trimmedPhone && a.patientId === trimmedPatientId)
      );
      updatedAccounts.push(newAccount);
      localStorage.setItem('familyAccounts', JSON.stringify(updatedAccounts));

      // 3. Save current active session
      localStorage.setItem('currentFamilyUser', JSON.stringify(newAccount));
      localStorage.setItem('userRole', 'family');
      localStorage.setItem('viewerRole', 'family');
      selectPatient(trimmedPatientId);

      // 4. Link patient in viewer API
      await viewerApi.ensureSession('family', true);
      await viewerApi.linkPatient(trimmedPatientId);

      setSuccess(`Account created for ${trimmedName}. Please sign in with your 4-digit code.`);
      setTimeout(() => {
        setIsSignUp(false);
        setLoginIdentifier(trimmedPhone);
        setLoginPin('');
        setSuccess('');
      }, 1200);
    } catch (err) {
      setError(err.message || 'Error completing registration. Please try again.');
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedId = loginIdentifier.trim().toUpperCase();
    const cleanPhone = loginIdentifier.trim().replace(/\D/g, '');

    if (!trimmedId) {
      setError('Please enter your Phone Number or Patient ID.');
      return;
    }
    if (loginPin.length !== 4) {
      setError('Please enter your 4-digit code.');
      return;
    }

    setLoading(true);

    try {
      const existingAccounts = JSON.parse(localStorage.getItem('familyAccounts') || '[]');
      const found = existingAccounts.find(
        (a) => (a.patientId.toUpperCase() === trimmedId || a.phone.replace(/\D/g, '') === cleanPhone) && a.pin === loginPin
      );

      if (!found) {
        setError('Invalid Phone / Patient ID or 4-digit code. Please check your credentials or Sign Up.');
        setLoading(false);
        return;
      }

      // Successful login
      localStorage.setItem('currentFamilyUser', JSON.stringify(found));
      localStorage.setItem('userRole', 'family');
      localStorage.setItem('viewerRole', 'family');
      selectPatient(found.patientId);

      await viewerApi.ensureSession('family', true);
      await viewerApi.linkPatient(found.patientId);

      setSuccess(`Welcome back, ${found.name}! Logging you into the dashboard...`);
      setTimeout(() => {
        navigate('/family-dashboard');
      }, 1000);
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="family-login-container">
      <div className="family-login-card">
        {/* Back Button */}
        <button className="family-login-back" onClick={() => navigate('/role-selection')}>
          <ArrowLeft size={18} /> Back to Roles
        </button>

        {/* Header */}
        <div className="family-login-header">
          <div className="family-icon-badge">
            <Users size={36} />
          </div>
          <h1 className="family-login-title">Family & Caregiver Portal</h1>
          <p className="family-login-subtitle">
            Stay connected, monitor cognitive progress, and assist your loved one.
          </p>
        </div>

        {/* Auth Mode Toggle */}
        <div className="family-auth-tabs">
          <button
            type="button"
            className={`family-auth-tab ${isSignUp ? 'active' : ''}`}
            onClick={() => {
              setIsSignUp(true);
              setError('');
              setSuccess('');
            }}
          >
            <HeartHandshake size={18} /> Sign Up
          </button>
          <button
            type="button"
            className={`family-auth-tab ${!isSignUp ? 'active' : ''}`}
            onClick={() => {
              setIsSignUp(false);
              setError('');
              setSuccess('');
            }}
          >
            <LogIn size={18} /> Login
          </button>
        </div>

        {/* Error / Success Alerts */}
        {error && (
          <div className="family-login-alert error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="family-login-alert success">
            <CheckCircle size={18} />
            <span>{success}</span>
          </div>
        )}

        {/* Sign Up Form */}
        {isSignUp ? (
          <form className="family-form" onSubmit={handleSignUp}>
            {/* Name */}
            <div className="form-group">
              <label htmlFor="family-name">
                <User size={16} /> Your Name
              </label>
              <input
                id="family-name"
                type="text"
                placeholder="e.g. John Doe / Sarah Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Phone Number */}
            <div className="form-group">
              <label htmlFor="family-phone">
                <Phone size={16} /> Phone Number
              </label>
              <input
                id="family-phone"
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            {/* Patient ID */}
            <div className="form-group">
              <label htmlFor="patient-id">
                <Hash size={16} /> Patient ID
              </label>
              <input
                id="patient-id"
                type="text"
                placeholder="e.g. MM26A001"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value.toUpperCase())}
                required
              />
            </div>

            {/* Patient Relation */}
            <div className="form-group">
              <label htmlFor="patient-relation">
                <HeartHandshake size={16} /> Relation to Patient
              </label>
              <select
                id="patient-relation"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                required
              >
                {RELATIONS.map((rel) => (
                  <option key={rel} value={rel}>
                    {rel}
                  </option>
                ))}
              </select>
            </div>

            {/* 4-Digit Code Setup (Entry 1) */}
            <div className="form-group pin-group">
              <label htmlFor="family-pin">
                <Lock size={16} /> Create 4-Digit Security Code
              </label>
              <div className="pin-input-wrapper">
                <input
                  id="family-pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  className="pin-input"
                  value={pin}
                  onChange={(e) => handlePinChange(e.target.value, setPin)}
                  required
                />
                <button
                  type="button"
                  className="pin-visibility-btn"
                  onClick={() => setShowPin(!showPin)}
                  tabIndex="-1"
                >
                  {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <small className="field-hint">Choose any 4-digit numeric code to protect your access</small>
            </div>

            {/* 4-Digit Code Confirmation (Entry 2) */}
            <div className="form-group pin-group">
              <label htmlFor="family-confirm-pin">
                <Lock size={16} /> Confirm 4-Digit Security Code
              </label>
              <div className="pin-input-wrapper">
                <input
                  id="family-confirm-pin"
                  type={showConfirmPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  className={`pin-input ${confirmPin && confirmPin !== pin ? 'mismatch' : ''} ${confirmPin && confirmPin === pin ? 'match' : ''}`}
                  value={confirmPin}
                  onChange={(e) => handlePinChange(e.target.value, setConfirmPin)}
                  required
                />
                <button
                  type="button"
                  className="pin-visibility-btn"
                  onClick={() => setShowConfirmPin(!showConfirmPin)}
                  tabIndex="-1"
                >
                  {showConfirmPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {confirmPin && confirmPin !== pin && (
                <span className="field-error-text">Codes do not match</span>
              )}
              {confirmPin && confirmPin === pin && pin.length === 4 && (
                <span className="field-success-text">✓ 4-digit codes match!</span>
              )}
            </div>

            {/* Submit Button */}
            <button type="submit" className="family-submit-btn" disabled={loading}>
              {loading ? (
                'Connecting...'
              ) : (
                <>
                  Sign Up & Open Dashboard <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Login Form */
          <form className="family-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="login-id">
                <User size={16} /> Phone Number or Patient ID
              </label>
              <input
                id="login-id"
                type="text"
                placeholder="e.g. 9876543210 or MM26A001"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                required
              />
            </div>

            <div className="form-group pin-group">
              <label htmlFor="login-pin">
                <Lock size={16} /> 4-Digit Security Code
              </label>
              <div className="pin-input-wrapper">
                <input
                  id="login-pin"
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  className="pin-input"
                  value={loginPin}
                  onChange={(e) => handlePinChange(e.target.value, setLoginPin)}
                  required
                />
                <button
                  type="button"
                  className="pin-visibility-btn"
                  onClick={() => setShowPin(!showPin)}
                  tabIndex="-1"
                >
                  {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="family-submit-btn" disabled={loading}>
              {loading ? (
                'Verifying...'
              ) : (
                <>
                  Login to Family Dashboard <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        <div className="family-login-footer">
          <p>
            {isSignUp ? (
              <>
                Already set up your 4-digit code?{' '}
                <button
                  type="button"
                  className="link-switch-btn"
                  onClick={() => {
                    setIsSignUp(false);
                    setError('');
                    setSuccess('');
                  }}
                >
                  Login here
                </button>
              </>
            ) : (
              <>
                New family member?{' '}
                <button
                  type="button"
                  className="link-switch-btn"
                  onClick={() => {
                    setIsSignUp(true);
                    setError('');
                    setSuccess('');
                  }}
                >
                  Create account & 4-digit code
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default FamilyLoginPage;
