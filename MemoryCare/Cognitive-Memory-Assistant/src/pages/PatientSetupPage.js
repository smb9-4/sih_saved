import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import '../styles/PatientSetupPage.css';
import { STRINGS as SETUP_STRINGS } from '../i18nReact';
import { getAppLanguage } from '../i18n';
import { speak, setVoiceLang, stopSpeaking } from '../services/voice';
import { registerPatient } from '../services/patientRegistry';

const LANGUAGE_OPTIONS = [
  { code: 'brx', label: 'Bodo' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'as', label: 'Assamese' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mni', label: 'Manipuri / Meitei' },
];

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

function setupT(lang, key) {
  const pack = SETUP_STRINGS[lang] || SETUP_STRINGS.en;
  return pack[key] || SETUP_STRINGS.en[key] || key;
}

function PatientSetupPage({ setPatient }) {
  const navigate = useNavigate();
  const [lang, setLang] = useState(() => getAppLanguage());
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    phone: '',
    emergencyPhone: '',
    state: '',
    emergencyContact: ''
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setVoiceLang(lang);
    speak(setupT(lang, 'setupSubtitle'));
    return () => stopSpeaking();
  }, [lang]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleLanguagePick = (code) => {
    localStorage.setItem('preferredLang', code);
    setLang(code);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = setupT(lang, 'errName');
    if (!formData.age || formData.age < 1 || formData.age > 150) newErrors.age = setupT(lang, 'errAge');
    const phoneRegex = /^\d{10}$/;
    
    if (!formData.phone.trim()) {
      newErrors.phone = setupT(lang, 'errPhone');
    } else if (!phoneRegex.test(formData.phone.trim())) {
      newErrors.phone = 'Phone number must be exactly 10 digits';
    }

    if (!formData.emergencyPhone.trim()) {
      newErrors.emergencyPhone = setupT(lang, 'errPhone');
    } else if (!phoneRegex.test(formData.emergencyPhone.trim())) {
      newErrors.emergencyPhone = 'Phone number must be exactly 10 digits';
    }
    if (!formData.state) newErrors.state = setupT(lang, 'errState');
    if (!formData.emergencyContact.trim()) newErrors.emergencyContact = setupT(lang, 'errContact');
    return newErrors;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = validateForm();

    if (Object.keys(newErrors).length === 0) {
      const patientData = {
        ...formData,
        language: lang,
        createdAt: new Date().toISOString(),
        reminders: [],
        gameScore: 0
      };
      localStorage.setItem('preferredLang', lang);
      const registered = registerPatient(patientData);
      localStorage.setItem('patientData', JSON.stringify(registered));
      setPatient(registered);
      navigate('/dashboard');
    } else {
      setErrors(newErrors);
    }
  };

  return (
    <div className="patient-setup-container">
      <div className="patient-setup-content">
        <h1 className="setup-title">{setupT(lang, 'setupTitle')}</h1>
        <p className="setup-subtitle">
          {setupT(lang, 'setupSubtitle')}{' '}
          <button
            type="button"
            className="speak-btn"
            style={{ padding: '4px 10px', fontSize: '0.9rem', marginLeft: '8px' }}
            onClick={() => speak(setupT(lang, 'setupSubtitle'))}
          >
            🔊 {setupT(lang, 'speak')}
          </button>
        </p>

        <form className="setup-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="language" className="form-label">{setupT(lang, 'language')}</label>
            <select
              id="language"
              name="language"
              value={lang}
              onChange={(e) => handleLanguagePick(e.target.value)}
              className="form-input"
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="name" className="form-label">{setupT(lang, 'yourName')}</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={`form-input ${errors.name ? 'error' : ''}`}
              placeholder={setupT(lang, 'namePlaceholder')}
            />
            {errors.name && <span className="error-message">{errors.name}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="age" className="form-label">{setupT(lang, 'yourAge')}</label>
            <input
              type="number"
              id="age"
              name="age"
              value={formData.age}
              onChange={handleChange}
              className={`form-input ${errors.age ? 'error' : ''}`}
              placeholder={setupT(lang, 'agePlaceholder')}
              min="1"
              max="150"
            />
            {errors.age && <span className="error-message">{errors.age}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="phone" className="form-label">{setupT(lang, 'phoneLabel')}</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={`form-input ${errors.phone ? 'error' : ''}`}
              placeholder={setupT(lang, 'phonePlaceholder')}
            />
            {errors.phone && <span className="error-message">{errors.phone}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="state" className="form-label">{setupT(lang, 'stateLabel')}</label>
            <select
              id="state"
              name="state"
              value={formData.state}
              onChange={handleChange}
              className={`form-input ${errors.state ? 'error' : ''}`}
            >
              <option value="" disabled>{setupT(lang, 'statePlaceholder')}</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
            {errors.state && <span className="error-message">{errors.state}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="emergencyContact" className="form-label">{setupT(lang, 'emergencyName')}</label>
            <input
              type="text"
              id="emergencyContact"
              name="emergencyContact"
              value={formData.emergencyContact}
              onChange={handleChange}
              className={`form-input ${errors.emergencyContact ? 'error' : ''}`}
              placeholder={setupT(lang, 'emergencyNamePlaceholder')}
            />
            {errors.emergencyContact && <span className="error-message">{errors.emergencyContact}</span>}
          </div>

          <div className="form-group">
            <label htmlFor="emergencyPhone" className="form-label">{setupT(lang, 'emergencyPhone')}</label>
            <input
              type="tel"
              id="emergencyPhone"
              name="emergencyPhone"
              value={formData.emergencyPhone}
              onChange={handleChange}
              className={`form-input ${errors.emergencyPhone ? 'error' : ''}`}
              placeholder={setupT(lang, 'emergencyPhonePlaceholder')}
            />
            {errors.emergencyPhone && <span className="error-message">{errors.emergencyPhone}</span>}
          </div>

          <button type="submit" className="submit-btn">
            {setupT(lang, 'continue')}
            <ArrowRight size={24} />
          </button>
        </form>
      </div>
    </div>
  );
}

export default PatientSetupPage;