/**
 * PlayerService
 * Wraps react-native-track-player.
 * Handles: playback, sleep timer with fade, audio focus, Bluetooth events.
 */
import TrackPlayer, {
  Event,
  Capability,
  State,
  RepeatMode,
} from 'react-native-track-player';
import StateLedgerService from './StateLedgerService';
import MediaSyncService from './MediaSyncService';

let _initialized = false;
let _sleepTimer = null;
let _sleepFadeTimer = null;
let _positionUpdateTimer = null;
let _listeners = new Map();

const emit = (event, data) => {
  _listeners.get(event)?.forEach(cb => { try { cb(data); } catch {} });
};

export async function setupPlayer() {
  if (_initialized) return;

  await TrackPlayer.setupPlayer({
    minBuffer: 15,
    maxBuffer: 60,
    playBuffer: 3,
    backBuffer: 60,
    waitForBuffer: true,
  });

  await TrackPlayer.updateOptions({
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.SeekTo,
      Capability.JumpForward,
      Capability.JumpBackward,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
    jumpInterval: 30,
    progressUpdateEventThrottle: 1000,
    android: {
      appKilledPlaybackBehavior: 'StopPlaybackAndRemoveNotification',
    },
  });

  // Event listeners
  TrackPlayer.addEventListener(Event.PlaybackState, async ({ state }) => {
    const position = await TrackPlayer.getPosition();
    const posMs = Math.round(position * 1000);

    if (state === State.Paused || state === State.Stopped) {
      StateLedgerService.updatePosition(posMs, true);
      if (state === State.Stopped) {
        await StateLedgerService.endSession(posMs);
        emit('stopped', { posMs });
      } else {
        emit('paused', { posMs });
      }
    }

    if (state === State.Playing) {
      emit('playing', {});
      _startPositionUpdates();
    }

    emit('state_change', { state });
  });

  TrackPlayer.addEventListener(Event.PlaybackTrackChanged, async ({ nextTrack }) => {
    if (nextTrack !== null) {
      const track = await TrackPlayer.getTrack(nextTrack);
      emit('track_changed', { track });
    }
  });

  TrackPlayer.addEventListener(Event.PlaybackError, ({ message }) => {
    console.error('[PLAYER] Playback error:', message);
    emit('error', { message });
  });

  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) => TrackPlayer.seekTo(position));
  TrackPlayer.addEventListener(Event.RemoteJumpForward, async ({ interval }) => {
    const pos = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(pos + interval);
  });
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, async ({ interval }) => {
    const pos = await TrackPlayer.getPosition();
    await TrackPlayer.seekTo(Math.max(0, pos - interval));
  });

  _initialized = true;
  console.log('[PLAYER] Initialized');
}

export async function loadTrack(track, startPositionMs = 0) {
  await TrackPlayer.reset();
  await TrackPlayer.add({
    id: track.id,
    url: track.url, // Can be local file:// or remote stream URL
    title: track.title,
    artist: track.artist || 'Unknown',
    album: track.album || '',
    artwork: track.artwork,
    duration: track.duration,
    headers: track.headers,
  });

  if (startPositionMs > 0) {
    await TrackPlayer.seekTo(startPositionMs / 1000);
  }

  StateLedgerService.startSession(track.id, track.title, (track.duration || 0) * 1000);
}

export async function play() {
  await TrackPlayer.play();
}

export async function pause() {
  const pos = await TrackPlayer.getPosition();
  await TrackPlayer.pause();
  StateLedgerService.updatePosition(Math.round(pos * 1000), true);
}

export async function seekTo(seconds) {
  await TrackPlayer.seekTo(seconds);
  const posMs = Math.round(seconds * 1000);
  StateLedgerService.updatePosition(posMs, false);
}

export async function seekToMs(ms) {
  await seekTo(ms / 1000);
}

export async function skipForward(seconds = 30) {
  const pos = await TrackPlayer.getPosition();
  await seekTo(pos + seconds);
}

export async function skipBackward(seconds = 30) {
  const pos = await TrackPlayer.getPosition();
  await seekTo(Math.max(0, pos - seconds));
}

export async function setRate(rate) {
  await TrackPlayer.setRate(rate);
}

export async function getPosition() {
  return await TrackPlayer.getPosition();
}

export async function getDuration() {
  return await TrackPlayer.getDuration();
}

export async function getState() {
  return await TrackPlayer.getState();
}

export async function getProgress() {
  return await TrackPlayer.getProgress();
}

/**
 * Sleep timer with 30-second audio fade.
 */
export function setSleepTimer(minutes, onExpire) {
  clearSleepTimer();

  if (!minutes || minutes <= 0) return;

  console.log(`[PLAYER] Sleep timer: ${minutes}min`);
  emit('sleep_timer_set', { minutes });

  const totalMs = minutes * 60 * 1000;
  const fadeStartMs = totalMs - 30000;

  // Fade start
  if (fadeStartMs > 0) {
    _sleepFadeTimer = setTimeout(async () => {
      console.log('[PLAYER] Sleep fade starting...');
      emit('sleep_fade_start', {});
      // Fade volume from 1.0 to 0.0 over 30 seconds
      await _fadeVolume(1.0, 0.0, 30000);
    }, fadeStartMs);
  }

  // Final stop
  _sleepTimer = setTimeout(async () => {
    await pause();
    await TrackPlayer.setVolume(1.0); // Reset volume
    emit('sleep_timer_expired', {});
    onExpire?.();
    console.log('[PLAYER] Sleep timer expired');
  }, totalMs);
}

export function clearSleepTimer() {
  clearTimeout(_sleepTimer);
  clearTimeout(_sleepFadeTimer);
  _sleepTimer = null;
  _sleepFadeTimer = null;
  TrackPlayer.setVolume(1.0);
  emit('sleep_timer_cleared', {});
}

async function _fadeVolume(from, to, durationMs) {
  const steps = 60;
  const interval = durationMs / steps;
  const step = (to - from) / steps;
  let current = from;

  for (let i = 0; i < steps; i++) {
    current += step;
    await TrackPlayer.setVolume(Math.max(0, Math.min(1, current)));
    await new Promise(r => setTimeout(r, interval));
  }
}

function _startPositionUpdates() {
  clearInterval(_positionUpdateTimer);
  _positionUpdateTimer = setInterval(async () => {
    try {
      const pos = await TrackPlayer.getPosition();
      const posMs = Math.round(pos * 1000);
      StateLedgerService.updatePosition(posMs, false);
      emit('position_update', { posMs });
    } catch {}
  }, 5000); // Push to desktop every 5 seconds during playback
}

export function on(event, cb) {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event).add(cb);
  return () => _listeners.get(event)?.delete(cb);
}
