import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, CheckCircle, Users, Loader, ArrowLeft } from 'lucide-react';
import '../styles/LinkPatientPage.css';
import viewerApi, {
  ensureSession,
  selectPatient,
} from '../services/viewerApi';

function LinkPatientPage() {
  const navigate = useNavigate();
  const [patientId, setPatientId] = useState('');
  const [linkedPatients, setLinkedPatients] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);

  const loadLinked = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      await ensureSession('family');
      const list = await viewerApi.getLinkedPatients();
      setLinkedPatients(list);
      setLoadingList(false);
    } catch (e) {
      setError(e.message || 'Could not load linked patients.');
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadLinked();
  }, [loadLinked]);

  const handleLink = async () => {
    const id = patientId.trim();
    if (!id) {
      setError('Please enter the patient ID.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await ensureSession('family', true);
      const data = await viewerApi.linkPatient(id);
      setSuccess(`Patient "${data.patient.name}" linked successfully.`);
      setPatientId('');
      selectPatient(data.patient.patient_id);
      
      // reload full list
      const list = await viewerApi.getLinkedPatients();
      setLinkedPatients(list);
      
      setTimeout(() => navigate('/family-dashboard'), 900);
    } catch (e) {
      setError(e.message || 'Could not link patient.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (patient) => {
    selectPatient(patient.patient_id);
    navigate('/family-dashboard');
  };

  const handleBack = () => {
    navigate('/family-dashboard');
  };

  return (
    <div className="link-patient-page">
      <div className="link-patient-header">
        <button className="link-back" onClick={handleBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <h1 className="link-title">Connect to a Patient</h1>
        <p className="link-subtitle">
          Enter the patient's unique ID to view their progress and add family photos.
        </p>
      </div>

      {error && <div className="link-error">{error}</div>}
      {success && <div className="link-success">{success}</div>}

      <div className="link-form">
        <label htmlFor="patient-id-input">Patient ID</label>
        <input
          id="patient-id-input"
          type="text"
          value={patientId}
          onChange={(e) => setPatientId(e.target.value)}
          placeholder="e.g. MM26A001"
        />
        <button className="link-button" onClick={handleLink} disabled={loading}>
          {loading ? <Loader size={18} className="spin" /> : <Link2 size={18} />}
          {loading ? 'Linking…' : 'Link Patient'}
        </button>
      </div>

      <div className="link-list-section">
        <h2>Your connected patients</h2>
        {loadingList ? (
          <p className="link-muted">Loading…</p>
        ) : linkedPatients.length === 0 ? (
          <div className="link-empty">
            <Users size={32} />
            <p>No patients linked yet. Enter a patient ID above to connect.</p>
          </div>
        ) : (
          <div className="link-list">
            {linkedPatients.map((p) => (
              <div className="link-item" key={p.patient_id} onClick={() => handleSelect(p)}>
                <CheckCircle size={20} className="link-item-icon" />
                <div className="link-item-main">
                  <strong>{p.name}</strong>
                  <span>ID: {p.patient_id} · {p.age} yrs · Lang: {p.preferred_language}</span>
                  <span>Phone: {p.phone || 'N/A'} · State: {p.state || 'N/A'}</span>
                  <span>Emergency: {p.emergency_contact || 'N/A'} ({p.emergency_phone || 'N/A'})</span>
                </div>
                <span className="link-item-opens">Open →</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default LinkPatientPage;
