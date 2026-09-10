/**
 * SyncStatus.js
 * Non-blocking synchronization indicator and caregiver status panel.
 * Supports compact badge mode and full caregiver inspection card.
 */

import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import syncService from '../services/SyncService';
import { SYNC_STATUS } from '../types/sync';
import '../styles/SyncStatus.css';

export function SyncStatus({ mode = 'badge', patientId, onSyncComplete }) {
  const [syncState, setSyncState] = useState(() => syncService.getSyncStatusSync());
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Subscribe to sync service status changes
    const unsubscribe = syncService.onStatusChange((newStatus) => {
      setSyncState(newStatus);
    });

    // Refresh count on mount
    syncService.getSyncStatus().then(setSyncState);

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleSyncNow = async () => {
    if (isManualSyncing || syncState.isSyncing) return;
    setIsManualSyncing(true);
    try {
      if (syncState.failedCount > 0) {
        await syncService.retryFailedRecords();
      } else {
        await syncService.syncNow();
      }
      const updated = await syncService.getSyncStatus();
      setSyncState(updated);
      if (onSyncComplete) onSyncComplete(updated);
    } catch (err) {
      console.warn('Manual sync error:', err);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const formatTime = (iso) => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now - d;
      if (diffMs < 60000) return 'Just now';
      if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  // Status mapping
  const getBadgeInfo = () => {
    if (syncState.isSyncing || isManualSyncing) {
      return {
        cls: 'syncing',
        icon: <RefreshCw size={13} className="spin-icon" />,
        text: 'Syncing…',
      };
    }
    if (!syncState.isOnline) {
      return {
        cls: 'offline',
        icon: <WifiOff size={13} />,
        text: 'Offline — Saved locally',
      };
    }
    if (syncState.failedCount > 0 || syncState.status === SYNC_STATUS.FAILED) {
      return {
        cls: 'failed',
        icon: <AlertCircle size={13} />,
        text: 'Sync failed — retrying',
      };
    }
    if (syncState.pendingCount > 0 || syncState.status === SYNC_STATUS.PENDING) {
      return {
        cls: 'pending',
        icon: <Clock size={13} />,
        text: `Sync pending (${syncState.pendingCount || 1})`,
      };
    }
    return {
      cls: 'synced',
      icon: <CheckCircle2 size={13} />,
      text: 'Synced',
    };
  };

  const badge = getBadgeInfo();

  // Mode: Full Caregiver Panel
  if (mode === 'caregiver') {
    return (
      <div className="caregiver-sync-card">
        <div className="caregiver-sync-header">
          <div className="caregiver-sync-title">
            <span className={`status-dot dot-${badge.cls}`}></span>
            <h4>Synchronization Status</h4>
          </div>
          <button
            className="caregiver-sync-btn"
            onClick={handleSyncNow}
            disabled={!syncState.isOnline || syncState.isSyncing || isManualSyncing}
          >
            <RefreshCw size={14} className={syncState.isSyncing || isManualSyncing ? 'spin-icon' : ''} />
            <span>{syncState.failedCount > 0 ? 'Retry Failed' : 'Sync Now'}</span>
          </button>
        </div>

        <div className="caregiver-sync-grid">
          <div className="sync-metric-tile">
            <span className="metric-label">Network</span>
            <span className={`metric-value ${syncState.isOnline ? 'text-online' : 'text-offline'}`}>
              {syncState.isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              {syncState.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          <div className="sync-metric-tile">
            <span className="metric-label">Last Synced</span>
            <span className="metric-value">{formatTime(syncState.lastSyncTime)}</span>
          </div>

          <div className="sync-metric-tile">
            <span className="metric-label">Pending Queue</span>
            <span className={`metric-value ${syncState.pendingCount > 0 ? 'text-amber' : ''}`}>
              {syncState.pendingCount || 0}
            </span>
          </div>

          <div className="sync-metric-tile">
            <span className="metric-label">Failed Retries</span>
            <span className={`metric-value ${syncState.failedCount > 0 ? 'text-red' : ''}`}>
              {syncState.failedCount || 0}
            </span>
          </div>
        </div>

        {syncState.lastError && (
          <div className="sync-error-notice">
            <AlertCircle size={13} />
            <span>{syncState.lastError}</span>
          </div>
        )}
      </div>
    );
  }

  // Default mode: Compact non-blocking badge for patient & topbars
  return (
    <>
      <div
        className={`sync-status-badge sync-status-${badge.cls}`}
        onClick={() => setShowModal(true)}
        role="button"
        tabIndex={0}
        title="Offline-first data status. Click for sync details."
      >
        {badge.icon}
        <span className="sync-status-text">{badge.text}</span>
      </div>

      {showModal && (
        <div className="sync-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="sync-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sync-modal-head">
              <h3>Offline Storage & Sync</h3>
              <button className="sync-modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="sync-modal-body">
              <p className="sync-modal-desc">
                MemoryCare stores all your games, difficulty adjustments, and metrics in local SQLite on this device.
                Nothing is lost when you are offline.
              </p>
              <div className="sync-modal-stats">
                <div className="modal-stat-row">
                  <span>Connection:</span>
                  <strong>{syncState.isOnline ? 'Online' : 'Offline (Saved Locally)'}</strong>
                </div>
                <div className="modal-stat-row">
                  <span>Last Sync:</span>
                  <strong>{formatTime(syncState.lastSyncTime)}</strong>
                </div>
                <div className="modal-stat-row">
                  <span>Pending Uploads:</span>
                  <strong>{syncState.pendingCount || 0}</strong>
                </div>
                <div className="modal-stat-row">
                  <span>Failed Attempts:</span>
                  <strong>{syncState.failedCount || 0}</strong>
                </div>
              </div>

              {syncState.isOnline && (
                <button
                  className="sync-modal-action-btn"
                  onClick={handleSyncNow}
                  disabled={syncState.isSyncing || isManualSyncing}
                >
                  <RefreshCw size={14} className={syncState.isSyncing || isManualSyncing ? 'spin-icon' : ''} />
                  <span>{syncState.isSyncing || isManualSyncing ? 'Syncing…' : 'Sync Now'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default SyncStatus;
