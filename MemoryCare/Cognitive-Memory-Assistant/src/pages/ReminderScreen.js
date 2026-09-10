import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Check, Wifi, WifiOff, Edit2, AlertCircle } from 'lucide-react';
import '../styles/ReminderScreen.css';
import Navigation from '../components/Navigation';
import TopBackButton from '../components/TopBackButton';
import {
  syncRemindersToSW,
  cancelReminderInSW,
  triggerReminderNotification,
  getOnlineStatus,
  isNative,
  syncRemindersToNative,
  scheduleNativeReminder,
  cancelNativeReminder,
  checkNotificationPermissions,
  requestNotificationPermissions,
  stopNotificationSound
} from '../services/pwa';

function ReminderScreen({ patient }) {
  const [reminders, setReminders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState(null);
  const [notificationPopup, setNotificationPopup] = useState(null);
  const [notifiedReminders, setNotifiedReminders] = useState(new Set());
  const [permissionStatus, setPermissionStatus] = useState('granted');
  const [formData, setFormData] = useState({
    type: 'medicine',
    name: '',
    time: '',
    description: '',
    days: [1, 2, 3, 4, 5, 6, 0]
  });
  const [isOnline, setIsOnline] = useState(getOnlineStatus());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const savedReminders = localStorage.getItem('reminders');
    let parsed = [];
    if (savedReminders) {
      try {
        parsed = JSON.parse(savedReminders);
        setReminders(parsed);
      } catch (e) {}
    }

    if (isNative()) {
      checkNotificationPermissions().then((status) => {
        setPermissionStatus(status);
        if (status === 'granted') {
          syncRemindersToNative(parsed).then((updated) => {
            if (updated && updated.length) {
              saveReminders(updated);
            }
          });
        }
      });
    } else if (parsed.length) {
      syncRemindersToSW(parsed);
    }
  }, []);

  // Interval check as in-app visual fallback when the screen is active
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const currentDay = now.getDay();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      reminders.forEach(reminder => {
        const days = Array.isArray(reminder.days) && reminder.days.length ? reminder.days : [0, 1, 2, 3, 4, 5, 6];
        if (days.includes(currentDay) && reminder.time === currentTime && !reminder.completed && !notifiedReminders.has(reminder.id)) {
          setNotificationPopup(reminder);
          setNotifiedReminders(prev => new Set([...prev, reminder.id]));
          triggerReminderNotification(reminder);
        }
      });
    };

    checkReminders();
    const interval = setInterval(checkReminders, 10000); // Check every 10 seconds to avoid timer drift

    return () => clearInterval(interval);
  }, [reminders, notifiedReminders]);

  const closeNotification = () => {
    stopNotificationSound();
    setNotificationPopup(null);
  };

  const saveReminders = (newReminders) => {
    localStorage.setItem('reminders', JSON.stringify(newReminders));
    setReminders(newReminders);
  };

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermissions();
    setPermissionStatus(granted ? 'granted' : 'denied');
    if (granted && reminders.length && isNative()) {
      const updated = await syncRemindersToNative(reminders);
      if (updated && updated.length) {
        saveReminders(updated);
      }
    }
  };

  const handleStartEdit = (reminder) => {
    setEditingReminderId(reminder.id);
    setFormData({
      type: reminder.type || 'medicine',
      name: reminder.name || '',
      time: reminder.time || '',
      description: reminder.description || '',
      days: Array.isArray(reminder.days) && reminder.days.length ? reminder.days : [1, 2, 3, 4, 5, 6, 0]
    });
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setEditingReminderId(null);
    setFormData({ type: 'medicine', name: '', time: '', description: '', days: [1, 2, 3, 4, 5, 6, 0] });
    setShowForm(false);
  };

  const handleSaveReminder = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.time) {
      alert('Please fill in all fields');
      return;
    }

    if (!formData.days.length) {
      alert('Please choose at least one day');
      return;
    }

    if (editingReminderId) {
      // Edit existing reminder: cancel old notifications and schedule new ones
      const existing = reminders.find(r => r.id === editingReminderId);
      if (existing) {
        if (isNative()) {
          await cancelNativeReminder(existing);
        }

        const updatedItem = {
          ...existing,
          type: formData.type,
          name: formData.name,
          time: formData.time,
          description: formData.description,
          days: formData.days,
        };

        if (isNative() && !updatedItem.completed) {
          const notificationIds = await scheduleNativeReminder(updatedItem);
          updatedItem.notificationIds = notificationIds;
        }

        const updatedReminders = reminders.map(r => r.id === editingReminderId ? updatedItem : r);
        saveReminders(updatedReminders);
        if (!isNative()) syncRemindersToSW(updatedReminders);
      }
    } else {
      // Add new reminder
      const newReminder = {
        id: Date.now(),
        type: formData.type,
        name: formData.name,
        time: formData.time,
        description: formData.description,
        days: formData.days,
        completed: false,
        notificationIds: [],
        createdAt: new Date().toISOString()
      };

      if (isNative()) {
        const notificationIds = await scheduleNativeReminder(newReminder);
        newReminder.notificationIds = notificationIds;
      }

      const updatedReminders = [...reminders, newReminder];
      saveReminders(updatedReminders);
      if (!isNative()) syncRemindersToSW(updatedReminders);
    }

    setFormData({ type: 'medicine', name: '', time: '', description: '', days: [1, 2, 3, 4, 5, 6, 0] });
    setEditingReminderId(null);
    setShowForm(false);
  };

  const handleCompleteReminder = async (id) => {
    const target = reminders.find(r => r.id === id);
    if (!target) return;
    const willComplete = !target.completed;
    const updatedTarget = { ...target, completed: willComplete };

    if (isNative()) {
      if (willComplete) {
        await cancelNativeReminder(target);
        updatedTarget.notificationIds = [];
      } else {
        const notificationIds = await scheduleNativeReminder(updatedTarget);
        updatedTarget.notificationIds = notificationIds;
      }
    }

    const updatedReminders = reminders.map(r => r.id === id ? updatedTarget : r);
    saveReminders(updatedReminders);
    if (!isNative()) syncRemindersToSW(updatedReminders);
  };

  const handleDeleteReminder = async (id) => {
    const toDelete = reminders.find(r => r.id === id);
    const updatedReminders = reminders.filter(r => r.id !== id);
    saveReminders(updatedReminders);
    if (isNative()) {
      await cancelNativeReminder(toDelete || id);
    } else {
      cancelReminderInSW(id);
    }
  };

  return (
    <div className="reminder-page">
      <div className="reminder-container">
        <div className="reminder-content">
          <div className="top-back-row">
            <TopBackButton to="/dashboard" />
          </div>
          <div className="reminder-header">
            <h1 className="page-title">Daily Reminders</h1>
            <p className="page-subtitle">Stay on track with your tasks</p>
            <div className={`offline-badge ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span>{isOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          {permissionStatus !== 'granted' && (
            <div className="permission-alert-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle size={22} color="#D97706" />
                <p className="permission-alert-text">
                  Notifications are disabled. Grant permission to hear alarms when the app is closed.
                </p>
              </div>
              <button className="btn-grant-permission" onClick={handleRequestPermission}>
                Enable Notifications
              </button>
            </div>
          )}

          <div className="reminder-stats">
            <div className="stat-box">
              <span className="stat-number">{reminders.length}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat-box completed">
              <span className="stat-number">{reminders.filter(r => r.completed).length}</span>
              <span className="stat-label">Completed</span>
            </div>
            <div className="stat-box pending">
              <span className="stat-number">{reminders.filter(r => !r.completed).length}</span>
              <span className="stat-label">Pending</span>
            </div>
          </div>

          {!showForm && (
            <button className="add-reminder-btn" onClick={() => { setEditingReminderId(null); setShowForm(true); }}>
              <Plus size={32} />
              Add New Reminder
            </button>
          )}

          {showForm && (
            <form className="reminder-form" onSubmit={handleSaveReminder}>
              <label className="reminder-field-label" htmlFor="reminder-type">
                {editingReminderId ? 'Edit reminder' : 'What is this reminder for?'}
              </label>
              <select
                id="reminder-type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="form-input"
              >
                <option value="water">Drinking water</option>
                <option value="medicine">Medicine</option>
                <option value="going">Going somewhere</option>
                <option value="other">Other</option>
              </select>
              <input
                type="text"
                placeholder="Reminder name (e.g., Take Medicine)"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="form-input"
              />
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="form-input"
              />
              <fieldset className="days-fieldset">
                <legend>Repeat on</legend>
                <div className="weekday-picker">
                  {[['M', 1, 'Monday'], ['T', 2, 'Tuesday'], ['W', 3, 'Wednesday'], ['T', 4, 'Thursday'], ['F', 5, 'Friday'], ['S', 6, 'Saturday'], ['S', 0, 'Sunday']].map(([label, value, name]) => (
                    <button
                      type="button"
                      key={name}
                      className={`weekday-chip ${formData.days.includes(value) ? 'selected' : ''}`}
                      aria-label={name}
                      aria-pressed={formData.days.includes(value)}
                      onClick={() => setFormData({
                        ...formData,
                        days: formData.days.includes(value)
                          ? formData.days.filter((day) => day !== value)
                          : [...formData.days, value]
                      })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <textarea
                placeholder="Description (optional)"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="form-textarea"
                rows="3"
              />
              <div className="form-buttons">
                <button type="submit" className="btn-submit">
                  {editingReminderId ? 'Update Reminder' : 'Save Reminder'}
                </button>
                <button type="button" className="btn-cancel" onClick={handleCancelForm}>Cancel</button>
              </div>
            </form>
          )}

          <div className="reminders-list">
            {reminders.length === 0 ? (
              <div className="empty-state">
                <p>No reminders yet. Add one to get started!</p>
              </div>
            ) : (
              reminders.map(reminder => (
                <div key={reminder.id} className={`reminder-item ${reminder.completed ? 'completed' : ''}`}>
                  <div className="reminder-info">
                    <div className="reminder-time">{reminder.time}</div>
                    <div className="reminder-details">
                      <span className="reminder-type">{reminder.type === 'water' ? 'Water' : reminder.type === 'going' ? 'Going somewhere' : reminder.type === 'medicine' ? 'Medicine' : 'Other'}</span>
                      <h3 className="reminder-name">{reminder.name}</h3>
                      <p className="reminder-days">{(reminder.days || [1, 2, 3, 4, 5, 6, 0]).map((day) => ['S', 'M', 'T', 'W', 'T', 'F', 'S'][day]).join(' · ')}</p>
                      {reminder.description && (
                        <p className="reminder-description">{reminder.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="reminder-actions">
                    <button
                      className={`action-btn complete-btn ${reminder.completed ? 'done' : ''}`}
                      onClick={() => handleCompleteReminder(reminder.id)}
                      title={reminder.completed ? 'Mark as incomplete' : 'Mark as complete'}
                    >
                      <Check size={24} />
                    </button>
                    <button
                      className="action-btn edit-btn"
                      onClick={() => handleStartEdit(reminder)}
                      title="Edit reminder"
                    >
                      <Edit2 size={20} />
                    </button>
                    <button
                      className="action-btn delete-btn"
                      onClick={() => handleDeleteReminder(reminder.id)}
                      title="Delete reminder"
                    >
                      <Trash2 size={24} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {notificationPopup && (
        <div className="notification-overlay">
          <div className="notification-popup">
            <div className="notification-header">
              <h2 className="notification-title">⏰ Reminder Alert!</h2>
            </div>
            <div className="notification-content">
              <h3 className="notification-reminder-name">{notificationPopup.name}</h3>
              <p className="notification-time">Time: {notificationPopup.time}</p>
              {notificationPopup.description && (
                <p className="notification-description">{notificationPopup.description}</p>
              )}
            </div>
            <div className="notification-buttons">
              <button className="btn-notification-done" onClick={() => {
                handleCompleteReminder(notificationPopup.id);
                closeNotification();
              }}>
                ✓ Done
              </button>
              <button className="btn-notification-close" onClick={closeNotification}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <Navigation />
    </div>
  );
}

export default ReminderScreen;
