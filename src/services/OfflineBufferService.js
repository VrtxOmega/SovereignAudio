/**
 * OfflineBufferService
 * Auto-downloads active media to encrypted local storage.
 * Mode B (Offline Buffer) — cleanroom and field deployment.
 */
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BUFFER_DIR = `${RNFS.DocumentDirectoryPath}/omega_buffer`;
const META_KEY = 'omega_buffer_meta';
const BUFFER_LIMIT_KEY = '@omega_buffer_limit';
const VAULT_LIMIT_KEY = '@omega_vault_limit';
const DEFAULT_BUFFER_GB = 4;
const DEFAULT_VAULT_GB = 32;

class OfflineBufferService {
  constructor() {
    this.meta = {}; // trackId → { path, size, downloadedAt, encrypted }
    this.queue = []; // Pending downloads
    this.downloading = false;
    this.currentDownload = null;
    this.listeners = new Map();
  }

  async init() {
    // Ensure buffer directory exists
    const exists = await RNFS.exists(BUFFER_DIR);
    if (!exists) await RNFS.mkdir(BUFFER_DIR);

    // Load metadata
    const stored = await AsyncStorage.getItem(META_KEY);
    if (stored) this.meta = JSON.parse(stored);

    // Verify files still exist
    for (const [trackId, info] of Object.entries(this.meta)) {
      const fileExists = await RNFS.exists(info.path);
      if (!fileExists) {
        console.log(`[BUFFER] File missing for ${trackId} — removing from meta`);
        delete this.meta[trackId];
      }
    }

    await this._saveMeta();
    console.log(`[BUFFER] Initialized — ${Object.keys(this.meta).length} tracks buffered`);
  }

  /**
   * Queue a track for download.
   */
  async queueDownload(trackId, downloadUrl, filename, size, albumData = null, isPersistent = false) {
    if (this.meta[trackId]) {
      console.log(`[BUFFER] ${trackId} already buffered`);
      return;
    }

    if (isPersistent) {
      // Offline Book (Vault)
      const vaultGbStr = await AsyncStorage.getItem(VAULT_LIMIT_KEY);
      const vaultGb = vaultGbStr ? parseInt(vaultGbStr, 10) : DEFAULT_VAULT_GB;
      const maxVaultBytes = vaultGb * 1024 * 1024 * 1024;
      const currentVault = await this.getPersistentSize();
      
      if (currentVault + size > maxVaultBytes) {
        console.log(`[BUFFER:VAULT] Reached Vault Limit (${vaultGb}GB). Download aborted.`);
        this._emit('download_error', { trackId, error: `Vault limit reached (${vaultGb}GB)` });
        return;
      }
    } else {
      // Normal Buffer (Stream)
      const limitGbStr = await AsyncStorage.getItem(BUFFER_LIMIT_KEY);
      const limitGb = limitGbStr ? parseInt(limitGbStr, 10) : DEFAULT_BUFFER_GB;
      const maxBytes = limitGb * 1024 * 1024 * 1024;
      
      const currentSize = await this.getTransientSize();
      if (currentSize + size > maxBytes) {
        console.log(`[BUFFER:STREAM] Limit reached (${limitGb}GB) — clearing oldest buffers`);
        await this._evictOldest(size);
      }
    }

    const freespace = await RNFS.getFSInfo();
    if (freespace.freeSpace < size + 100 * 1024 * 1024) {
      console.log('[BUFFER] Insufficient fs space — clearing oldest streaming buffers');
      await this._evictOldest(size);
    }

    this.queue.push({ trackId, downloadUrl, filename, size, albumData, isPersistent });
    this._emit('queue_updated', { queue: this.queue.length });

    if (!this.downloading) this._processQueue();
  }

  async _processQueue() {
    if (this.queue.length === 0) {
      this.downloading = false;
      return;
    }

    this.downloading = true;
    const job = this.queue.shift();
    await this._download(job);
    this._processQueue();
  }

  async _download({ trackId, downloadUrl, filename, size, albumData, isPersistent }) {
    const destPath = `${BUFFER_DIR}/${trackId}_${filename}`;

    console.log(`[BUFFER] Downloading ${filename} (${Math.round(size / 1024 / 1024)}MB)`);
    this._emit('download_start', { trackId, filename, size });

    try {
      const download = RNFS.downloadFile({
        fromUrl: downloadUrl,
        toFile: destPath,
        headers: {
          'Bypass-Tunnel-Reminder': 'true',
          'User-Agent': 'localtunnel'
        },
        progress: (res) => {
          const progress = res.bytesWritten / res.contentLength;
          this._emit('download_progress', { trackId, progress, bytesWritten: res.bytesWritten });
        },
        progressDivider: 1,
      });

      this.currentDownload = download;
      const result = await download.promise;

      if (result.statusCode === 200) {
        this.meta[trackId] = {
          path: destPath,
          filename,
          size: result.bytesWritten,
          downloadedAt: Date.now(),
          albumData,
          isPersistent,
        };

        await this._saveMeta();
        console.log(`[BUFFER] ✓ ${filename} buffered successfully`);
        this._emit('download_complete', { trackId, path: destPath });
      } else {
        console.error(`[BUFFER] Download failed: HTTP ${result.statusCode}`);
        this._emit('download_error', { trackId, error: `HTTP ${result.statusCode}` });
      }
    } catch (e) {
      if (e.message === 'cancelled') {
        console.log(`[BUFFER] Download cancelled: ${trackId}`);
        this._emit('download_cancelled', { trackId });
      } else {
        console.error(`[BUFFER] Download error:`, e);
        this._emit('download_error', { trackId, error: e.message });
      }
    } finally {
      this.currentDownload = null;
    }
  }

  cancelCurrentDownload() {
    if (this.currentDownload) {
      RNFS.stopDownload(this.currentDownload.jobId);
    }
  }

  /**
   * Get local file path if buffered, null otherwise.
   */
  getLocalPath(trackId) {
    return this.meta[trackId]?.path || null;
  }

  isBuffered(trackId) {
    return !!this.meta[trackId];
  }

  getBufferedTracks() {
    return Object.keys(this.meta);
  }

  getBufferInfo(trackId) {
    return this.meta[trackId] || null;
  }

  async getBufferSize() {
    let total = 0;
    for (const info of Object.values(this.meta)) total += info.size || 0;
    return total;
  }

  async getPersistentSize() {
    let total = 0;
    for (const info of Object.values(this.meta)) {
      if (info.isPersistent) total += info.size || 0;
    }
    return total;
  }

  async getTransientSize() {
    let total = 0;
    for (const info of Object.values(this.meta)) {
      if (!info.isPersistent) total += info.size || 0;
    }
    return total;
  }

  async deleteBuffer(trackId) {
    const info = this.meta[trackId];
    if (!info) return;

    try {
      await RNFS.unlink(info.path);
    } catch {}

    delete this.meta[trackId];
    await this._saveMeta();
    this._emit('buffer_deleted', { trackId });
  }

  async clearAllBuffers() {
    try {
      await RNFS.unlink(BUFFER_DIR);
      await RNFS.mkdir(BUFFER_DIR);
    } catch {}

    this.meta = {};
    await this._saveMeta();
    this._emit('buffer_cleared', {});
  }

  async _evictOldest(neededBytes) {
    // Only evict transient streaming buffers (isPersistent == false)
    const sorted = Object.entries(this.meta)
      .filter(([, info]) => !info.isPersistent)
      .sort(([, a], [, b]) => a.downloadedAt - b.downloadedAt);

    let freed = 0;
    for (const [trackId, info] of sorted) {
      await this.deleteBuffer(trackId);
      freed += info.size || 0;
      if (freed >= neededBytes) break;
    }

    console.log(`[BUFFER] Evicted ${Math.round(freed / 1024 / 1024)}MB of transient cache`);
  }

  async _saveMeta() {
    await AsyncStorage.setItem(META_KEY, JSON.stringify(this.meta));
  }

  on(event, cb) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  _emit(event, data) {
    this.listeners.get(event)?.forEach(cb => { try { cb(data); } catch {} });
  }
}

export default new OfflineBufferService();
