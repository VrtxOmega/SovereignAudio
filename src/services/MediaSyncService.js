import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const SYNC_PORT = 5002;
const HEARTBEAT_INTERVAL = 10000;
const HEARTBEAT_MISS_LIMIT = 5; // Tolerates up to 50s of LocalTunnel proxy jitter
const CONN_KEY = 'omega_media_host';

class MediaSyncService {
  constructor() {
    this.connected = false;
    this.mode = 'offline';
    this.listeners = new Map();
    this.heartbeatTimer = null;
    this.heartbeatMisses = 0;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.host = null;
    this.onNetworkChange = null;
  }

  async init(host) {
    if (host) {
      this.host = host.replace(/^(https?:\/\/|wss?:\/\/)/, '').replace(/\/.*$/, '');
      await AsyncStorage.setItem(CONN_KEY, this.host);
      // Also save to settings screen key to keep them synced
      await AsyncStorage.setItem('@omega_host_ip', this.host);
    } else {
      const saved = await AsyncStorage.getItem(CONN_KEY) || await AsyncStorage.getItem('@omega_host_ip');
      this.host = saved ? saved.replace(/^(https?:\/\/|wss?:\/\/)/, '').replace(/\/.*$/, '') : null;
    }

    if (this.onNetworkChange) {
      this.onNetworkChange();
      this.onNetworkChange = null;
    }

    this.onNetworkChange = NetInfo.addEventListener(state => {
      const isAvailable = state.isConnected !== false;
      if (isAvailable && !this.connected && this.host) {
        this._connect();
      }
    });

    if (this.host) {
      this._connect();
    } else {
      this._setMode('offline');
    }
  }

  _connect() {
    this.connected = false;
    if (!this.host) return;

    console.log(`[MEDIA_SYNC] Initializing HTTP Sync Polling to ${this.host}`);
    this.connected = true;
    this._setMode('online');

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    
    this._startHeartbeat();
  }

  getHttpUrl(path = '') {
    if (!this.host) return null;
    if (this.host.includes('.loca.lt') || this.host.includes('.ngrok')) {
      return `https://${this.host}${path}`;
    }
    return `http://${this.host}:${SYNC_PORT}${path}`;
  }

  async fetchLibrary(retries = 3) {
    const url = this.getHttpUrl('/library');
    if (!url) {
      this._emit('LIBRARY_ERROR', 'No Desktop Sync IP Configured.');
      return false;
    }
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const res = await fetch(url, { 
          headers: { 
            'Bypass-Tunnel-Reminder': 'true',
            'User-Agent': 'localtunnel'
          },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        
        // Success reset
        this.heartbeatMisses = 0;
        this._setMode('online');
        
        this._emit('LIBRARY_RESPONSE', data);
        return data;
      } catch (e) {
        if (attempt === retries) {
          console.warn('[MEDIA_SYNC] fetchLibrary failed after retries:', e);
          this._emit('LIBRARY_ERROR', `Fetch Error: ${e.message} (${url})`);
          return false;
        }
        await new Promise(r => setTimeout(r, attempt * 1000));
      }
    }
  }

  _startHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatMisses = 0;
    
    const sendPing = async () => {
      if (!this.connected) return;
      const url = this.getHttpUrl('/api/sync');
      if (!url) return;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const payload = { type: 'HEARTBEAT', ts: Date.now() };
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Bypass-Tunnel-Reminder': 'true',
            'User-Agent': 'localtunnel'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (res.ok) {
          this.heartbeatMisses = 0;
          if (this.mode !== 'online') this._setMode('online');
        } else {
          throw new Error('HTTP ' + res.status);
        }
      } catch (e) {
        this.heartbeatMisses++;
        if (this.heartbeatMisses >= HEARTBEAT_MISS_LIMIT) {
          console.warn('[MEDIA_SYNC] Heartbeat missed limit. Going offline.');
          this.connected = false;
          this._setMode('offline');
          this._scheduleReconnect();
        }
      }
    };

    sendPing();
    this.heartbeatTimer = setInterval(sendPing, HEARTBEAT_INTERVAL);
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    
    const delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    this.reconnectTimer = setTimeout(() => {
      if (this.host) {
        this.reconnectAttempts++;
        this._connect();
      }
    }, delay);
  }

  _setMode(mode) {
    if (this.mode !== mode) {
      this.mode = mode;
      this._emit('mode_change', { mode });
      console.log(`[MEDIA_SYNC] Mode: ${mode.toUpperCase()}`);
    }
  }

  async sendPlayheadUpdate(trackId, positionMs, isPaused) {
    if (!this.connected || !this.host) return;
    const url = this.getHttpUrl('/api/sync');
    if (!url) return;

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          'User-Agent': 'localtunnel'
        },
        body: JSON.stringify({
          type: 'PLAYHEAD_UPDATE',
          track_id: trackId,
          position_ms: positionMs,
          is_paused: isPaused
        })
      });
    } catch (e) {}
  }

  async send(type, data = {}) {
    if (!this.connected || !this.host) return;
    const url = this.getHttpUrl('/api/sync');
    if (!url) return;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Bypass-Tunnel-Reminder': 'true',
          'User-Agent': 'localtunnel'
        },
        body: JSON.stringify({ type, ...data })
      });
      const responseBody = await res.json();
      if (responseBody && responseBody.type) {
        this._emit(responseBody.type, responseBody);
      }
    } catch (e) {}
  }

  pushPosition(trackId, positionMs, isPaused) {
    return this.send('PLAYHEAD_UPDATE', { track_id: trackId, position_ms: positionMs, is_paused: isPaused });
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  _emit(event, data) {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(data); } catch (e) {}
    });
  }

  getMode() { return this.mode; }
  isConnected() { return this.connected; }

  destroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    clearTimeout(this.reconnectTimer);
    if (this.onNetworkChange) this.onNetworkChange();
  }
}

export default new MediaSyncService();
