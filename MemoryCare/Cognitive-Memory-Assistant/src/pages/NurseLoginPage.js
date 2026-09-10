import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Stethoscope, User, Phone, Building2, Hash, Lock,
  CheckCircle, ArrowLeft, AlertCircle, Eye, EyeOff, LogIn, ArrowRight, UserPlus
} from 'lucide-react';
import '../styles/NurseLoginPage.css';
import viewerApi, { selectPatient } from '../services/viewerApi';
import { listRegisteredPatients, findRegisteredPatient, registerPatient } from '../services/patientRegistry';
import { languageLabel } from '../i18n';

function NurseLoginPage() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('nurseAccounts') || '[]').length === 0;
    } catch {
      return true;
    }
  });

  // Sign Up form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hospitalName, setHospitalName] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  // Login form states
  const [loginPatientId, setLoginPatientId] = useState('');
  const [loginPin, setLoginPin] = useState('');

  // Patient list for scroll-down selection
  const [patients, setPatients] = useState([]);

  // UI states
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const list = listRegisteredPatients();
      setPatients(list);
    } catch (e) {
      console.error('Failed to load registered patients:', e);
    }
  }, []);

  const handlePinChange = (value, setter) => {
    // Restrict strictly to 4 numeric digits
    const cleaned = value.replace(/\D/g, '').slice(0, 4);
    setter(cleaned);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedHospital = hospitalName.trim();

    if (!trimmedName) {
      setError('Please enter your full name.');
      return;
    }
    if (!trimmedPhone || trimmedPhone.replace(/\D/g, '').length < 7) {
      setError('Please enter a valid phone number.');
      return;
    }
    if (!trimmedHospital) {
      setError('Please enter your hospital or clinic name.');
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
      setError('4-digit codes do not match. Please re-enter confirmation code.');
      return;
    }

    setLoading(true);

    try {
      const existingAccounts = JSON.parse(localStorage.getItem('nurseAccounts') || '[]');
      const newAccount = {
        id: `nurse-${Date.now()}`,
        name: trimmedName,
        phone: trimmedPhone,
        hospitalName: trimmedHospital,
        pin,
        createdAt: new Date().toISOString(),
      };

      // Save or update account
      const filtered = existingAccounts.filter((a) => a.phone !== trimmedPhone);
      filtered.push(newAccount);
      localStorage.setItem('nurseAccounts', JSON.stringify(filtered));

      // Save current active nurse session
      localStorage.setItem('currentNurseUser', JSON.stringify(newAccount));
      localStorage.setItem('userRole', 'nurse');
      localStorage.setItem('viewerRole', 'nurse');

      setSuccess(`Account registered successfully, Nurse ${trimmedName}! Please proceed to login with your Patient ID and 4-digit code.`);
      setLoading(false);

      // Auto-switch to login tab and prefill PIN
      setTimeout(() => {
        setIsSignUp(false);
        setLoginPin(pin);
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const trimmedPatientId = loginPatientId.trim().toUpperCase();

    if (!trimmedPatientId) {
      setError('Please select or type a Patient ID.');
      return;
    }
    if (loginPin.length !== 4) {
      setError('Please enter your 4-digit code.');
      return;
    }

    setLoading(true);

    try {
      const existingAccounts = JSON.parse(localStorage.getItem('nurseAccounts') || '[]');
      const matchedNurse = existingAccounts.find((a) => a.pin === loginPin);

      if (!matchedNurse && existingAccounts.length > 0) {
        setError('Invalid 4-digit code. Please verify your code or register an account.');
        setLoading(false);
        return;
      }

      // Check or create patient record if typed manually
      let patient = findRegisteredPatient(trimmedPatientId);
      if (!patient) {
        patient = registerPatient({
          patient_id: trimmedPatientId,
          name: `Patient (${trimmedPatientId})`,
          age: 68,
          preferred_language: 'en',
          emergency_contact: matchedNurse ? matchedNurse.name : 'Nurse on Duty',
          emergency_phone: matchedNurse ? matchedNurse.phone : '',
        });
      }

      // Set active session & selected patient
      if (matchedNurse) {
        localStorage.setItem('currentNurseUser', JSON.stringify(matchedNurse));
      } else {
        // Fallback default nurse session
        const defaultNurse = {
          id: `nurse-guest`,
          name: 'Nurse',
          hospitalName: 'Healthcare Facility',
          pin: loginPin,
        };
        localStorage.setItem('currentNurseUser', JSON.stringify(defaultNurse));
      }

      localStorage.setItem('userRole', 'nurse');
      localStorage.setItem('viewerRole', 'nurse');
      selectPatient(trimmedPatientId);

      await viewerApi.ensureSession('nurse', true);
      await viewerApi.linkPatient(trimmedPatientId);

      setSuccess(`Access granted for Patient ${trimmedPatientId}. Loading Nurse Dashboard...`);
      setTimeout(() => {
        navigate('/nurse-dashboard');
      }, 1000);
    } catch (err) {
      setError(err.message || 'Login failed. Please check your credentials.');
      setLoading(false);
    }
  };

  const handleDropdownSelect = (e) => {
    const selected = e.target.value;
    if (selected) {
      setLoginPatientId(selected);
    }
  };

  return (
    <div className="nurse-login-container">
      <div className="nurse-login-card">
        {/* Back Button */}
        <button className="nurse-login-back" onClick={() => navigate('/role-selection')}>
          <ArrowLeft size={18} /> Back to Roles
        </button>

        {/* Header */}
        <div className="nurse-login-header">
          <div className="nurse-icon-badge">
            <Stethoscope size={36} />
          </div>
          <h1 className="nurse-login-title">Nurse & Healthcare Portal</h1>
          <p className="nurse-login-subtitle">
            Secure clinical access to patient cognitive progress, reminders, and performance analytics.
          </p>
        </div>

        {/* Auth Mode Toggle */}
        <div className="nurse-auth-tabs">
          <button
            type="button"
            className={`nurse-auth-tab ${isSignUp ? 'active' : ''}`}
            onClick={() => {
              setIsSignUp(true);
              setError('');
              setSuccess('');
            }}
          >
            <UserPlus size={18} /> Sign Up
          </button>
          <button
            type="button"
            className={`nurse-auth-tab ${!isSignUp ? 'active' : ''}`}
            onClick={() => {
              setIsSignUp(false);
              setError('');
              setSuccess('');
            }}
          >
            <LogIn size={18} /> Login
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="nurse-login-alert error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="nurse-login-alert success">
            <CheckCircle size={18} />
            <span>{success}</span>
          </div>
        )}

        {/* Sign Up Form */}
        {isSignUp ? (
          <form className="nurse-form" onSubmit={handleSignUp}>
            {/* Nurse Name */}
            <div className="form-group">
              <label htmlFor="nurse-name">
                <User size={16} /> Nurse Name
              </label>
              <input
                id="nurse-name"
                type="text"
                placeholder="e.g. Nurse Rachel Green"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Phone Number */}
            <div className="form-group">
              <label htmlFor="nurse-phone">
                <Phone size={16} /> Phone Number
              </label>
              <input
                id="nurse-phone"
                type="tel"
                placeholder="e.g. 9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>

            {/* Hospital Name */}
            <div className="form-group">
              <label htmlFor="nurse-hospital">
                <Building2 size={16} /> Hospital / Clinic Name
              </label>
              <input
                id="nurse-hospital"
                type="text"
                placeholder="e.g. City Care Memorial Hospital"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                required
              />
            </div>

            {/* 4-Digit Code Setup (Entry 1) */}
            <div className="form-group pin-group">
              <label htmlFor="nurse-pin">
                <Lock size={16} /> Create 4-Digit Security Code
              </label>
              <div className="pin-input-wrapper">
                <input
                  id="nurse-pin"
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
              <small className="field-hint">Choose any 4-digit numeric code to protect your clinical access</small>
            </div>

            {/* 4-Digit Code Confirmation (Entry 2) */}
            <div className="form-group pin-group">
              <label htmlFor="nurse-confirm-pin">
                <Lock size={16} /> Confirm 4-Digit Security Code
              </label>
              <div className="pin-input-wrapper">
                <input
                  id="nurse-confirm-pin"
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

            {/* Sign Up Submit Button */}
            <button type="submit" className="nurse-submit-btn" disabled={loading}>
              {loading ? (
                'Registering...'
              ) : (
                <>
                  Register Nurse Account <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Login Form */
          <form className="nurse-form" onSubmit={handleLogin}>
            {/* 4-Digit Code */}
            <div className="form-group pin-group">
              <label htmlFor="login-nurse-pin">
                <Lock size={16} /> 4-Digit Security Code
              </label>
              <div className="pin-input-wrapper">
                <input
                  id="login-nurse-pin"
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

            {/* Patient ID Section with Scroll-down Dropdown AND Typing Input */}
            <div className="form-group">
              <label htmlFor="login-patient-id-input">
                <Hash size={16} /> Patient ID
              </label>

              {/* Scroll Down Dropdown Option */}
              <div className="patient-select-wrapper">
                <select
                  id="nurse-patient-dropdown"
                  className="patient-dropdown-select"
                  onChange={handleDropdownSelect}
                  value={patients.some((p) => p.patient_id === loginPatientId) ? loginPatientId : ''}
                >
                  <option value="">-- Scroll to select a registered patient --</option>
                  {patients.map((p) => (
                    <option key={p.patient_id} value={p.patient_id}>
                      {p.patient_id} — {p.name} ({p.age} yrs, {languageLabel(p.preferred_language || p.language || 'en')})
                    </option>
                  ))}
                </select>
              </div>

              {/* Typing Input for Patient ID */}
              <div className="patient-type-wrapper">
                <input
                  id="login-patient-id-input"
                  type="text"
                  placeholder="Or type Patient ID manually (e.g. MM26A001)"
                  value={loginPatientId}
                  onChange={(e) => setLoginPatientId(e.target.value.toUpperCase())}
                  required
                />
              </div>
              <small className="field-hint">
                Select from the scrollable patient list above or type the ID directly.
              </small>
            </div>

            {/* Login Submit Button */}
            <button type="submit" className="nurse-submit-btn" disabled={loading}>
              {loading ? (
                'Verifying...'
              ) : (
                <>
                  Access Nurse Dashboard <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer Toggle */}
        <div className="nurse-login-footer">
          <p>
            {isSignUp ? (
              <>
                Already registered?{' '}
                <button
                  type="button"
                  className="link-switch-btn"
                  onClick={() => {
                    setIsSignUp(false);
                    setError('');
                    setSuccess('');
                  }}
                >
                  Login to Patient Record
                </button>
              </>
            ) : (
              <>
                New nurse or hospital staff?{' '}
                <button
                  type="button"
                  className="link-switch-btn"
                  onClick={() => {
                    setIsSignUp(true);
                    setError('');
                    setSuccess('');
                  }}
                >
                  Create Nurse Account
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default NurseLoginPage;
