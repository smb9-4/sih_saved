import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Phone, PhoneCall, X, MapPin, 
  Volume2, ShieldAlert, HeartPulse, Shield, UserCheck, 
  Clock, AlertTriangle, Siren
} from 'lucide-react';
import '../styles/EmergencyCallScreen.css';
import Navigation from '../components/Navigation';
import TopBackButton from '../components/TopBackButton';
import { getAppLanguage } from '../i18n';
import { speak, stopSpeaking } from '../services/voice';

const EMERGENCY_SERVICES = [
  {
    id: '112',
    name: 'National Emergency',
    nameLocal: {
      hi: 'राष्ट्रीय आपातकालीन (112)',
      bn: 'জাতীয় জরুরি সেবা (112)',
      as: 'ৰাষ্ট্ৰীয় জৰুৰীকালীন (112)',
      mni: 'লৈবাক্কী অখন্ন মতেং (112)',
      en: 'National Emergency (112)',
    },
    number: '112',
    desc: 'Police · Fire · Ambulance (All-in-One Pan India)',
    icon: ShieldAlert,
    color: '#D32F2F',
    badge: '24x7 Helpline',
  },
  {
    id: '108',
    name: 'Medical Ambulance',
    nameLocal: {
      hi: 'एम्बुलेंस / चिकित्सा आपातकाल (108)',
      bn: 'অ্যাম্বুলেন্স / চিকিৎসা জরুরি (108)',
      as: 'এম্বুলেন্স / চিকিৎসা জৰুৰীকালীন (108)',
      mni: 'এম্বুলেন্স / অনাবাগী মতেং (108)',
      en: 'Ambulance Emergency (108)',
    },
    number: '108',
    desc: 'Immediate Critical Medical Transport & Paramedics',
    icon: HeartPulse,
    color: '#E53935',
    badge: 'Toll-Free',
  },
  {
    id: '100',
    name: 'Police Assistance',
    nameLocal: {
      hi: 'पुलिस सहायता (100)',
      bn: 'পুলিশ সহায়তা (100)',
      as: 'আৰক্ষী সাহাৰ্য্য (100)',
      mni: 'পুলিসকী মতেং (100)',
      en: 'Police Helpline (100)',
    },
    number: '100',
    desc: 'Immediate Law & Order / Safety Intervention',
    icon: Shield,
    color: '#1565C0',
    badge: 'Toll-Free',
  },
  {
    id: '14567',
    name: 'Senior Citizen & Memory Care Helpline (Elderline)',
    nameLocal: {
      hi: 'वरिष्ठ नागरिक एवं मेमोरी केयर हेल्पलाइन (14567)',
      bn: 'প্রবীণ নাগরিক ও স্মৃতিসেবা হেল্পলাইন (14567)',
      as: 'জ্যেষ্ঠ নাগৰিক আৰু স্মৃতিসেৱা হেল্পলাইন (14567)',
      mni: 'অহনগী মীওই অমসুং নিংশিং লমজিং হেল্পলাইন (14567)',
      en: 'Elderline & Dementia Helpline (14567)',
    },
    number: '14567',
    desc: 'National Senior Helpline · Dementia & Alzheimer Support',
    icon: UserCheck,
    color: '#6A1B9A',
    badge: 'Elderline Support',
  },
];

const LOCALIZED_TITLES = {
  hi: { title: 'आपातकालीन सहायता', subtitle: 'आवश्यकता के समय त्वरित सहायता' },
  bn: { title: 'জরুরি সহায়তা', subtitle: 'প্রয়োজনের সময় তাত্ক্ষণিক সাহায্য' },
  as: { title: 'জৰুৰীকালীন সাহাৰ্য্য', subtitle: 'প্ৰয়োজনৰ সময়ত তাৎক্ষণিক সাহায্য' },
  mni: { title: 'অখন্ন মতেং', subtitle: 'মরুওইবা মতমদা য়াংনা মতেং ফংনবা' },
  en: { title: 'Emergency Assistance', subtitle: 'Quick 1-touch access to help when you need it' },
};

function EmergencyCallScreen({ patient: propPatient }) {
  const navigate = useNavigate();
  const lang = getAppLanguage();

  // Retrieve patient profile reliably
  const [patient] = useState(() => {
    if (propPatient && propPatient.name) return propPatient;
    try {
      const saved = localStorage.getItem('patientData');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [selectedService, setSelectedService] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [isReadingMedicalCard, setIsReadingMedicalCard] = useState(false);

  const timerRef = useRef(null);

  // Fetch GPS Coordinates (asks the user for location permission)
  const requestLocation = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setGpsError('Geolocation is not supported on this device.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsLocation({
          lat: pos.coords.latitude.toFixed(5),
          lng: pos.coords.longitude.toFixed(5),
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGpsLoading(false);
      },
      (err) => {
        console.warn('[Emergency] Geolocation unavailable:', err.message);
        setGpsError(err.code === 1
          ? 'Location permission denied. Please allow location access so emergency responders can find you.'
          : 'Unable to fetch your location. Tap Share Location to try again.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  useEffect(() => {
    requestLocation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Call timer effect
  useEffect(() => {
    if (activeCall) {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeCall]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const recordEmergencyEvent = (serviceName, number) => {
    try {
      const event = {
        id: `sos_${Date.now()}`,
        timestamp: new Date().toISOString(),
        serviceName,
        number,
        patientName: patient?.name || 'Patient',
        patientId: patient?.patient_id || 'N/A',
        state: patient?.state || 'Unknown',
        gps: gpsLocation,
      };
      localStorage.setItem('activeEmergencyAlert', JSON.stringify(event));
      
      const history = JSON.parse(localStorage.getItem('emergencyAlertsHistory') || '[]');
      history.unshift(event);
      localStorage.setItem('emergencyAlertsHistory', JSON.stringify(history.slice(0, 20)));
    } catch {
      /* ignore */
    }
  };

  const handleStartCall = (service) => {
    setSelectedService(service);
    setShowConfirmModal(true);
  };

  const handleConfirmCall = () => {
    if (!selectedService) return;
    setShowConfirmModal(false);

    // 1. Record emergency event for system & family visibility
    recordEmergencyEvent(selectedService.name, selectedService.number);

    // 2. Trigger native device dialer
    if (typeof window !== 'undefined') {
      window.location.href = `tel:${selectedService.number}`;
    }

    // 3. Open interactive calling screen
    setActiveCall({
      name: selectedService.nameLocal?.[lang] || selectedService.name,
      number: selectedService.number,
      icon: selectedService.icon,
      color: selectedService.color,
    });
  };

  const handleEndCall = () => {
    stopSpeaking();
    setActiveCall(null);
  };

  const handleDirectDial = (e, number, serviceName) => {
    e.stopPropagation();
    recordEmergencyEvent(serviceName, number);
    window.location.href = `tel:${number}`;
  };

  const handleSpeakMedicalInfo = () => {
    if (isReadingMedicalCard) {
      stopSpeaking();
      setIsReadingMedicalCard(false);
      return;
    }

    setIsReadingMedicalCard(true);
    const name = patient?.name || 'Patient';
    const age = patient?.age || '';
    const state = patient?.state || '';
    const contact = patient?.emergencyContact || '';
    const phone = patient?.emergencyPhone || '';

    let phrase = `Emergency attention! Patient ${name}, age ${age}, from ${state}. Emergency contact is ${contact}, phone ${phone}. Immediate medical care requested.`;
    
    if (lang === 'hi') {
      phrase = `आपातकालीन सूचना! मरीज ${name}, उम्र ${age} वर्ष, राज्य ${state}। आपातकालीन संपर्क ${contact}, फोन नंबर ${phone}। तत्काल सहायता आवश्यक है।`;
    } else if (lang === 'bn') {
      phrase = `জরুরি নোটিশ! রোগী ${name}, বয়স ${age} বছর, রাজ্য ${state}। জরুরি যোগাযোগ ${contact}, ফোন ${phone}। অবিলম্বে চিকিৎসা সহায়তা প্রয়োজন।`;
    } else if (lang === 'as') {
      phrase = `জৰুৰীকালীন জাননী! ৰোগী ${name}, বয়স ${age} বছৰ, ৰাজ্য ${state}। জৰুৰীকালীন যোগাযোগ ${contact}, ফোন ${phone}। তৎকালীন চিকিৎসা সাহাৰ্য্যৰ প্ৰয়োজন।`;
    } else if (lang === 'mni') {
      phrase = `অখন্ন পাও! অনাবা ${name}, চহি ${age}, লৈফম ${state}। অখন্ন মীওই ${contact}, ফোন ${phone}। য়াংনা লায়েংগী মতেং মথৌ তারি।`;
      phrase = `गोनांथार खौरां! बेरामी ${name}, बैसो ${age}, हादर ${state}। मददगिरि ${contact}, फोन ${phone}। थाबैनो देहा फाहामथाय नांगौ।`;
    }

    speak(phrase, () => {
      setIsReadingMedicalCard(false);
    });
  };

  const pageText = LOCALIZED_TITLES[lang] || LOCALIZED_TITLES.en;

  return (
    <div className="emergency-page">
      <div className="emergency-container">
        <div className="emergency-content">
          
          {/* Top-left Back Button */}
          <div className="emergency-top-back">
            <TopBackButton to="/dashboard" />
          </div>

          {/* Header */}
          <div className="emergency-header">
            <div className="sos-badge-top">
              <span className="sos-beacon"></span>
              <span>24/7 EMERGENCY ASSISTANCE</span>
            </div>
            <h1 className="emergency-title">{pageText.title}</h1>
            <p className="emergency-subtitle">{pageText.subtitle}</p>
          </div>

          {/* GPS Location Bar (asks for location permission) */}
          <div className="location-bar">
            <div className="location-left">
              <MapPin size={20} className="location-pin-icon" />
              <div>
                <span className="location-label">Your Live Location:</span>
                <span className="location-text">
                  {gpsLocation 
                    ? `GPS: ${gpsLocation.lat}, ${gpsLocation.lng} (±${gpsLocation.accuracy}m)`
                    : (gpsLoading ? 'Detecting GPS...' : (gpsError ? 'Location access needed for emergency response.' : (patient?.state ? `${patient.state}, India` : 'Requesting your location...')))
                  }
                </span>
              </div>
            </div>
            {gpsLocation ? (
              <a 
                href={`https://maps.google.com/?q=${gpsLocation.lat},${gpsLocation.lng}`} 
                target="_blank" 
                rel="noreferrer"
                className="map-view-link"
              >
                View Map
              </a>
            ) : (
              <button
                type="button"
                className="map-view-link"
                onClick={requestLocation}
                disabled={gpsLoading}
              >
                {gpsLoading ? 'Detecting…' : 'Share Location'}
              </button>
            )}
          </div>

          {gpsError && (
            <div className="location-permission-note">
              <AlertTriangle size={16} />
              <span>{gpsError}</span>
            </div>
          )}

          {/* Emergency Services Working Grid */}
          <div className="emergency-services-wrapper">
            <h2 className="services-headline">
              <ShieldAlert size={24} color="#D32F2F" />
              <span>Emergency Services (1-Touch Dial)</span>
            </h2>
            
            <div className="emergency-cards-grid">
              {EMERGENCY_SERVICES.map((srv) => {
                const IconComponent = srv.icon;
                const localizedName = srv.nameLocal?.[lang] || srv.name;
                return (
                  <div key={srv.id} className="emergency-service-card" style={{ borderColor: srv.color }}>
                    <div className="card-top">
                      <div className="service-icon-box" style={{ background: srv.color }}>
                        <IconComponent size={28} color="#FFFFFF" />
                      </div>
                      <div className="service-info">
                        <div className="service-badge">{srv.badge}</div>
                        <h3 className="service-title">{localizedName}</h3>
                        <p className="service-desc">{srv.desc}</p>
                      </div>
                    </div>
                    
                    <div className="service-action-row">
                      <a
                        href={`tel:${srv.number}`}
                        className="service-dial-btn"
                        style={{ background: srv.color }}
                        onClick={(e) => handleDirectDial(e, srv.number, srv.name)}
                      >
                        <PhoneCall size={20} />
                        <span>Call {srv.number} Now</span>
                      </a>
                      <button
                        type="button"
                        className="service-sim-btn"
                        onClick={() => handleStartCall(srv)}
                        title="In-App Call Simulator"
                      >
                        In-App Call
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Personal Emergency Contact & SOS Actions */}
          <div className="emergency-contact-box">
            <div className="contact-box-header">
              <div className="contact-title-group">
                <span className="contact-badge-icon">👤</span>
                <div>
                  <h3 className="contact-box-title">Primary Emergency Contact</h3>
                  <p className="contact-box-sub">Your registered family member / caregiver</p>
                </div>
              </div>
              <button 
                className="voice-readout-btn" 
                onClick={handleSpeakMedicalInfo}
                title="Speak details aloud"
              >
                <Volume2 size={18} />
                <span>{isReadingMedicalCard ? 'Stop Voice' : 'Voice Readout'}</span>
              </button>
            </div>

            {patient && patient.emergencyPhone ? (
              <div className="contact-card-body">
                <div className="contact-meta-row">
                  <div className="meta-item">
                    <span className="meta-label">Name</span>
                    <span className="meta-value">{patient.emergencyContact || 'Caregiver'}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Phone</span>
                    <span className="meta-value">{patient.emergencyPhone}</span>
                  </div>
                  <div className="meta-item">
                    <span className="meta-label">Patient ID</span>
                    <span className="meta-value">{patient.patient_id || 'MM26A001'}</span>
                  </div>
                </div>

                {/* Big one-touch actions, same format as Emergency Services */}
                <div className="emergency-cards-grid caregiver-actions-grid">
                  <div className="emergency-service-card" style={{ borderColor: '#2E7D32' }}>
                    <div className="card-top">
                      <div className="service-icon-box" style={{ background: '#2E7D32' }}>
                        <Phone size={28} color="#FFFFFF" />
                      </div>
                      <div className="service-info">
                        <div className="service-badge">Caregiver</div>
                        <h3 className="service-title">Call Caregiver Now</h3>
                        <p className="service-desc">{patient.emergencyContact || 'Caregiver'} · {patient.emergencyPhone}</p>
                      </div>
                    </div>
                    <div className="service-action-row">
                      <a
                        href={`tel:${patient.emergencyPhone}`}
                        className="service-dial-btn"
                        style={{ background: '#2E7D32' }}
                        onClick={(e) => handleDirectDial(e, patient.emergencyPhone, `Family: ${patient.emergencyContact}`)}
                      >
                        <PhoneCall size={20} />
                        <span>Call {patient.emergencyPhone} Now</span>
                      </a>
                    </div>
                  </div>

                  <div className="emergency-service-card" style={{ borderColor: '#E65100' }}>
                    <div className="card-top">
                      <div className="service-icon-box" style={{ background: '#E65100' }}>
                        <Siren size={28} color="#FFFFFF" />
                      </div>
                      <div className="service-info">
                        <div className="service-badge">SOS</div>
                        <h3 className="service-title">Send Me an SOS</h3>
                        <p className="service-desc">Immediate alert to {patient.emergencyContact || 'Caregiver'} · {patient.emergencyPhone}</p>
                      </div>
                    </div>
                    <div className="service-action-row">
                      <a
                        href={`tel:${patient.emergencyPhone}`}
                        className="service-dial-btn"
                        style={{ background: '#E65100' }}
                        onClick={(e) => handleDirectDial(e, patient.emergencyPhone, `SOS Alert: ${patient.emergencyContact}`)}
                      >
                        <PhoneCall size={20} />
                        <span>Call {patient.emergencyPhone} Now</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-contact-card">
                <p>No personal emergency contact found in your profile.</p>
                <button 
                  type="button" 
                  className="setup-redirect-btn" 
                  onClick={() => navigate('/patient-setup')}
                >
                  Configure Emergency Contact in Setup →
                </button>
              </div>
            )}
          </div>

          {/* Medical Identity Quick Summary */}
          {patient && (
            <div className="medical-id-summary">
              <div className="med-header">
                <HeartPulse size={18} color="#D32F2F" />
                <span>Patient Medical Card Reference</span>
              </div>
              <div className="med-grid">
                <div><strong>Patient:</strong> {patient.name || '—'}</div>
                <div><strong>Age:</strong> {patient.age ? `${patient.age} yrs` : '—'}</div>
                <div><strong>Language:</strong> {patient.preferred_language || patient.language || 'English'}</div>
                <div><strong>State:</strong> {patient.state || '—'}</div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && selectedService && (
        <div className="confirmation-modal" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <AlertTriangle size={54} className="warning-icon" />
            <h2>Confirm Emergency Call</h2>
            <p className="modal-lead">
              Are you sure you want to call <strong>{selectedService.nameLocal?.[lang] || selectedService.name}</strong> ({selectedService.number})?
            </p>
            <p className="modal-sub">
              This will directly dial the emergency service and transmit your patient emergency details.
            </p>
            <div className="confirmation-buttons">
              <button 
                className="btn-yes" 
                style={{ background: selectedService.color }}
                onClick={handleConfirmCall}
              >
                <PhoneCall size={22} />
                <span>Yes, Dial {selectedService.number}</span>
              </button>
              <button className="btn-no" onClick={() => setShowConfirmModal(false)}>
                <X size={22} />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active In-App Call Modal */}
      {activeCall && (
        <div className="calling-modal">
          <div className="modal-box in-call-card">
            <div className="call-beacon-ring">
              <div className="beacon-waves"></div>
              <PhoneCall size={44} color="#FFFFFF" className="call-avatar-icon" />
            </div>
            
            <div className="call-status-badge">● IN CALL / CONNECTED</div>
            <h2 className="in-call-name">{activeCall.name}</h2>
            <p className="in-call-number">Helpline: {activeCall.number}</p>
            
            <div className="call-timer-box">
              <Clock size={16} />
              <span>Duration: {formatTimer(callDuration)}</span>
            </div>

            <div className="in-call-info-box">
              <p className="in-call-note">
                ✓ Medical ID & Live GPS broadcasted to emergency responders.
              </p>
              <button 
                type="button" 
                className="in-call-voice-btn"
                onClick={handleSpeakMedicalInfo}
              >
                <Volume2 size={18} />
                <span>{isReadingMedicalCard ? 'Mute Speech' : 'Play Voice Dispatch Aloud'}</span>
              </button>
            </div>

            <div className="in-call-footer">
              <button className="end-call-btn" onClick={handleEndCall}>
                <Phone size={24} style={{ transform: 'rotate(135deg)' }} />
                <span>End Emergency Call</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <Navigation lang={lang} />
    </div>
  );
}

export default EmergencyCallScreen;
