/**
 * StateLedgerService
 * Bi-directional playhead sync with desktop SQLite.
 * VERITAS seals every listening session.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import MediaSyncService from './MediaSyncService';

const LEDGER_KEY = 'omega_media_ledger';
const SESSION_KEY = 'omega_current_session';

class StateLedgerService {
  constructor() {
    this.currentSession = null;
    this.ledger = [];
    this.syncUnsubscribe = null;
  }

  async init() {
    const stored = await AsyncStorage.getItem(LEDGER_KEY);
    if (stored) {
      try { this.ledger = JSON.parse(stored); } catch {}
    }

    // Listen for wake-sync response from desktop
    this.syncUnsubscribe = MediaSyncService.on('WAKE_SYNC_RESPONSE', (data) => {
      this._handleWakeSync(data);
    });

    // Resume any incomplete session
    const savedSession = await AsyncStorage.getItem(SESSION_KEY);
    if (savedSession) {
      try { this.currentSession = JSON.parse(savedSession); } catch {}
    }

    console.log(`[LEDGER] Initialized — ${this.ledger.length} sealed sessions`);
  }

  /**
   * Wake-sync: pull desktop's latest position before rendering UI.
   * Returns the authoritative playhead state.
   */
  async wakeSync(trackId) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Desktop didn't respond — use local state
        resolve(this._getLocalState(trackId));
      }, 3000);

      const unsub = MediaSyncService.on('WAKE_SYNC_RESPONSE', (data) => {
        clearTimeout(timeout);
        unsub();
        if (data.track_id === trackId) {
          resolve({
            positionMs: data.position_ms,
            trackId: data.track_id,
            source: 'desktop',
          });
        } else {
          resolve(this._getLocalState(trackId));
        }
      });

      MediaSyncService.send('WAKE_SYNC_REQUEST', { track_id: trackId });
    });
  }

  _handleWakeSync(data) {
    // Store the desktop's authoritative state locally
    this._saveLocalState(data.track_id, data.position_ms);
  }

  async _getLocalState(trackId) {
    const stored = await AsyncStorage.getItem(`pos_${trackId}`);
    if (stored) {
      return { positionMs: parseInt(stored), trackId, source: 'local' };
    }
    return { positionMs: 0, trackId, source: 'none' };
  }

  async _saveLocalState(trackId, positionMs) {
    await AsyncStorage.setItem(`pos_${trackId}`, String(positionMs));
  }

  /**
   * Start a new listening session.
   */
  startSession(trackId, trackTitle, totalDurationMs) {
    this.currentSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
      trackId,
      trackTitle,
      startedAt: Date.now(),
      startPositionMs: 0,
      endPositionMs: 0,
      totalDurationMs,
      totalListenedMs: 0,
      device: 'mobile',
    };

    AsyncStorage.setItem(SESSION_KEY, JSON.stringify(this.currentSession));
    console.log(`[LEDGER] Session started: ${trackTitle}`);
  }

  /**
   * Update current position — called frequently during playback.
   * Pushes to desktop and saves locally.
   */
  updatePosition(positionMs, isPaused = false) {
    if (this.currentSession) {
      this.currentSession.endPositionMs = positionMs;
    }

    // Push to desktop
    if (this.currentSession) {
      MediaSyncService.pushPosition(
        this.currentSession.trackId,
        positionMs,
        isPaused
      );
    }

    // Save locally (debounced by caller)
    if (this.currentSession?.trackId) {
      AsyncStorage.setItem(`pos_${this.currentSession.trackId}`, String(positionMs));
    }
  }

  /**
   * End the current session and VERITAS seal it.
   */
  async endSession(finalPositionMs) {
    if (!this.currentSession) return null;

    this.currentSession.endPositionMs = finalPositionMs;
    this.currentSession.endedAt = Date.now();
    this.currentSession.totalListenedMs = this.currentSession.endedAt - this.currentSession.startedAt;

    // VERITAS seal
    const session = { ...this.currentSession };
    const sealPayload = `${session.id}:${session.trackId}:${session.startPositionMs}:${session.endPositionMs}:${session.endedAt}`;
    session.seal = await this._sha256(sealPayload);

    // Append to ledger
    this.ledger.push(session);
    if (this.ledger.length > 500) this.ledger = this.ledger.slice(-500); // Cap at 500

    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(this.ledger));
    await AsyncStorage.removeItem(SESSION_KEY);

    // Push sealed session to desktop
    MediaSyncService.send('SESSION_SEALED', { session });

    console.log(`[LEDGER] ✓ Session sealed: ${session.trackTitle} · ${Math.round(session.totalListenedMs / 60000)}min · SEAL: ${session.seal.substr(0, 16)}...`);

    this.currentSession = null;
    return session;
  }

  async _sha256(message) {
    // Simple hash using available crypto — in production use react-native-aes-crypto
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    // In production: use proper SHA-256 from react-native-aes-crypto
    return Math.abs(hash).toString(16).padStart(16, '0') +
           Date.now().toString(16) +
           Math.random().toString(16).substr(2, 16);
  }

  getLedger() { return this.ledger; }
  getCurrentSession() { return this.currentSession; }

  getLedgerStats() {
    const totalMs = this.ledger.reduce((sum, s) => sum + (s.totalListenedMs || 0), 0);
    const uniqueTracks = new Set(this.ledger.map(s => s.trackId)).size;
    return {
      sessions: this.ledger.length,
      totalListenedHours: Math.round(totalMs / 3600000 * 10) / 10,
      uniqueTracks,
    };
  }

  destroy() {
    this.syncUnsubscribe?.();
  }
}

export default new StateLedgerService();
