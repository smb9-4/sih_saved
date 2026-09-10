import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, User, Stethoscope, UserPlus } from 'lucide-react';
import '../styles/RoleSelectionPage.css';

function RoleSelectionPage({ setRole }) {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState(null);

  // If already logged in, redirect directly to active dashboard
  useEffect(() => {
    const savedRole = localStorage.getItem('userRole');
    const savedPatient = localStorage.getItem('patientData');
    const savedFamily = localStorage.getItem('currentFamilyUser');
    const savedNurse = localStorage.getItem('currentNurseUser');

    if (savedRole === 'patient' && savedPatient) {
      navigate('/dashboard', { replace: true });
    } else if (savedRole === 'family' && savedFamily) {
      navigate('/family-dashboard', { replace: true });
    } else if (savedRole === 'nurse' && savedNurse) {
      navigate('/nurse-dashboard', { replace: true });
    }
  }, [navigate]);

  const savedPatientObj = (() => {
    try {
      return JSON.parse(localStorage.getItem('patientData'));
    } catch {
      return null;
    }
  })();

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    localStorage.setItem('userRole', role);
    if (setRole) setRole(role);
    
    setTimeout(() => {
      if (role === 'patient') {
        const savedPatient = localStorage.getItem('patientData');
        if (savedPatient) {
          navigate('/dashboard');
        } else {
          navigate('/patient-setup');
        }
      } else if (role === 'family') {
        localStorage.setItem('viewerRole', 'family');
        const savedFamily = localStorage.getItem('currentFamilyUser');
        if (savedFamily) {
          navigate('/family-dashboard');
        } else {
          navigate('/family-login');
        }
      } else if (role === 'nurse') {
        localStorage.setItem('viewerRole', 'nurse');
        const savedNurse = localStorage.getItem('currentNurseUser');
        if (savedNurse) {
          navigate('/nurse-dashboard');
        } else {
          navigate('/nurse-login');
        }
      }
    }, 200);
  };

  const handleNewPatientSignup = (e) => {
    e.stopPropagation();
    localStorage.removeItem('patientData');
    localStorage.setItem('userRole', 'patient');
    if (setRole) setRole('patient');
    navigate('/patient-setup');
  };

  return (
    <div className="role-selection-container">
      <div className="role-selection-content">
        <h1 className="role-title">Who are you?</h1>
        <p className="role-subtitle">Please select your role to continue</p>

        <div className="role-cards">
          <div 
            className={`role-card ${selectedRole === 'patient' ? 'selected' : ''}`}
            onClick={() => handleRoleSelect('patient')}
          >
            <div className="role-icon">
              <User size={60} />
            </div>
            <h2 className="role-label">Patient</h2>
            <p className="role-description">
              {savedPatientObj && savedPatientObj.name
                ? `Continue as ${savedPatientObj.name}`
                : 'I am looking for healthcare assistance'}
            </p>
            {savedPatientObj && (
              <button
                type="button"
                className="role-sub-action-btn"
                onClick={handleNewPatientSignup}
                title="Register a new patient profile"
              >
                <UserPlus size={14} /> New Patient Sign Up
              </button>
            )}
          </div>

          <div 
            className={`role-card ${selectedRole === 'family' ? 'selected' : ''}`}
            onClick={() => handleRoleSelect('family')}
          >
            <div className="role-icon">
              <Users size={60} />
            </div>
            <h2 className="role-label">Family</h2>
            <p className="role-description">I am assisting a loved one</p>
          </div>

          <div 
            className={`role-card ${selectedRole === 'nurse' ? 'selected' : ''}`}
            onClick={() => handleRoleSelect('nurse')}
          >
            <div className="role-icon">
              <Stethoscope size={60} />
            </div>
            <h2 className="role-label">Nurse</h2>
            <p className="role-description">I am a healthcare professional</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoleSelectionPage;
