/**
 * NetworkService.js
 * Connectivity monitoring using @capacitor/network with browser fallback and true backend reachability probe.
 */

class NetworkService {
  constructor() {
    this._isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this._connectionType = 'unknown';
    this._listeners = new Set();
    this._initialized = false;
    this._healthCheckUrl = '/api/v1/health';
  }

  async initialize() {
    if (this._initialized) return;
    this._initialized = true;

    try {
      const { Network } = await import('@capacitor/network');
      const status = await Network.getStatus();
      this._isOnline = Boolean(status.connected);
      this._connectionType = status.connectionType || 'unknown';

      await Network.addListener('networkStatusChange', (status) => {
        const wasOnline = this._isOnline;
        this._isOnline = Boolean(status.connected);
        this._connectionType = status.connectionType || 'unknown';

        if (wasOnline !== this._isOnline) {
          this._notifyListeners(this._isOnline, this._connectionType);
        }
      });
    } catch (err) {
      console.warn('[NetworkService] Capacitor Network plugin not available, using browser events:', err.message);
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
          this._isOnline = true;
          this._notifyListeners(true, 'wifi');
        });
        window.addEventListener('offline', () => {
          this._isOnline = false;
          this._notifyListeners(false, 'none');
        });
      }
    }
  }

  get isOnline() {
    return this._isOnline;
  }

  getConnectionType() {
    return this._connectionType;
  }

  addListener(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  removeListener(listener) {
    this._listeners.delete(listener);
  }

  _notifyListeners(online, connectionType) {
    for (const listener of this._listeners) {
      try {
        listener({ isOnline: online, connectionType });
      } catch (err) {
        console.error('[NetworkService] Listener error:', err);
      }
    }
  }

  /**
   * Lightweight health check to backend.
   * Verifies actual internet access and backend reachability, not just local Wi-Fi.
   */
  async checkBackendHealth() {
    if (!this._isOnline) return false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500);

      const res = await fetch(this._healthCheckUrl, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);

      return res.ok;
    } catch (err) {
      return false;
    }
  }
}

export const networkService = new NetworkService();
export default networkService;
