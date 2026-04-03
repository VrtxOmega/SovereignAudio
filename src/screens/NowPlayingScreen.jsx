import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TouchableWithoutFeedback, StyleSheet,
  Dimensions, Image, Animated, PanResponder, Modal,
  ScrollView, Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, spacing, radius, typography } from '../theme/veritas';
import * as PlayerService from '../services/PlayerService';
import StateLedgerService from '../services/StateLedgerService';
import MediaSyncService from '../services/MediaSyncService';
import OfflineBufferService from '../services/OfflineBufferService';

const { width: W, height: H } = Dimensions.get('window');
const ARTWORK_SIZE = W - spacing.xxl * 2;

// Speeds available
const SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
const SLEEP_OPTIONS = [15, 30, 45, 60, 90]; // minutes

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// Tactile transport button with physical "travel" press
const TactileButton = ({ icon, onPress, size = 40, primary = false, disabled = false }) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, { toValue: 0.88, duration: 80, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.timing(scale, { toValue: 1.0, duration: 120, useNativeDriver: true }).start();
  };

  return (
    <TouchableWithoutFeedback
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
    >
      <Animated.View style={[
        styles.tactileBtn,
        primary && styles.tactileBtnPrimary,
        { width: size, height: size, borderRadius: size / 2, transform: [{ scale }] },
        disabled && { opacity: 0.35 }
      ]}>
        <Text style={[styles.tactileBtnIcon, { fontSize: primary ? size * 0.45 : size * 0.38 }]}>
          {icon}
        </Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

// Chapter drawer
const ChapterDrawer = ({ chapters, currentPositionMs, onSeek, onClose }) => {
  const currentChapterIdx = chapters.findLastIndex
    ? chapters.findLastIndex(c => c.startMs <= currentPositionMs)
    : chapters.reduce((acc, c, i) => c.startMs <= currentPositionMs ? i : acc, 0);

  return (
    <View style={styles.drawerContainer}>
      <View style={styles.drawerHandle} />
      <View style={styles.drawerHeader}>
        <Text style={styles.drawerTitle}>CHAPTERS</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.drawerClose}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.drawerList}>
        {chapters.map((chapter, i) => {
          const isActive = i === currentChapterIdx;
          const timeStr = formatTime(chapter.startMs / 1000);

          return (
            <TouchableOpacity
              key={i}
              style={[styles.chapterRow, isActive && styles.chapterRowActive]}
              onPress={() => { onSeek(chapter.startMs); onClose(); }}
              activeOpacity={0.7}
            >
              <View style={[styles.chapterDot, isActive && styles.chapterDotActive]} />
              <View style={styles.chapterInfo}>
                <Text style={[styles.chapterTitle, isActive && styles.chapterTitleActive]}
                  numberOfLines={1}>
                  {chapter.title}
                </Text>
                <Text style={styles.chapterTime}>{timeStr}</Text>
              </View>
              {isActive && <Text style={styles.chapterNowPlaying}>▶</Text>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

// Sleep timer picker
const SleepTimerPicker = ({ currentMinutes, onSet, onClear, onClose }) => (
  <View style={styles.pickerContainer}>
    <View style={styles.drawerHandle} />
    <View style={styles.drawerHeader}>
      <Text style={styles.drawerTitle}>SLEEP TIMER</Text>
      <TouchableOpacity onPress={onClose}><Text style={styles.drawerClose}>✕</Text></TouchableOpacity>
    </View>
    {currentMinutes > 0 && (
      <TouchableOpacity style={styles.clearTimerBtn} onPress={() => { onClear(); onClose(); }}>
        <Text style={styles.clearTimerText}>Clear Current Timer ({currentMinutes}min remaining)</Text>
      </TouchableOpacity>
    )}
    {SLEEP_OPTIONS.map(min => (
      <TouchableOpacity
        key={min}
        style={[styles.sleepOption, currentMinutes === min && styles.sleepOptionActive]}
        onPress={() => { onSet(min); onClose(); }}
      >
        <Text style={[styles.sleepOptionText, currentMinutes === min && { color: colors.gold }]}>
          {min} minutes
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

export default function NowPlayingScreen({ route, navigation }) {
  const { track: initialTrack } = route.params || {};

  const [track, setTrack] = useState(initialTrack);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(1); // 1.0x
  const [showChapters, setShowChapters] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepFading, setSleepFading] = useState(false);
  const [mode, setMode] = useState(MediaSyncService.getMode());
  const [isBuffered, setIsBuffered] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [chapters, setChapters] = useState(track?.chapters || []);

  const artworkPulse = useRef(new Animated.Value(1)).current;
  const posTimerRef = useRef(null);

  useEffect(() => {
    _initPlayback();

    const unsubState = PlayerService.on('state_change', ({ state }) => {
      setIsPlaying(state === 'playing');
      if (state === 'playing') _startPulse();
      else _stopPulse();
    });

    const unsubPos = PlayerService.on('position_update', ({ posMs }) => {
      if (!seeking) setPositionMs(posMs);
    });

    const unsubTrack = PlayerService.on('track_changed', ({ track: t }) => {
      if (t) setTrack(t);
    });

    const unsubMode = MediaSyncService.on('mode_change', ({ mode }) => setMode(mode));

    const unsubSleepFade = PlayerService.on('sleep_fade_start', () => setSleepFading(true));
    const unsubSleepExpired = PlayerService.on('sleep_timer_expired', () => {
      setSleepMinutes(0);
      setSleepFading(false);
    });

    // Countdown timer for sleep display
    posTimerRef.current = setInterval(async () => {
      try {
        const progress = await PlayerService.getProgress();
        if (!seeking && progress) {
          setPositionMs(Math.round(progress.position * 1000));
          setDurationMs(Math.round(progress.duration * 1000));
        }
      } catch {}
    }, 500);

    return () => {
      unsubState(); unsubPos(); unsubTrack(); unsubMode();
      unsubSleepFade(); unsubSleepExpired();
      clearInterval(posTimerRef.current);
      _stopPulse();
    };
  }, []);

  const _initPlayback = async () => {
    if (!track) return;

    // Check if buffered
    const buffered = OfflineBufferService.isBuffered(track.id);
    setIsBuffered(buffered);

    // Wake-sync — get authoritative position from desktop
    const syncState = await StateLedgerService.wakeSync(track.id);
    const startMs = syncState.positionMs || 0;

    // Determine URL — local buffer first, then stream from aiohttp node
    let url = MediaSyncService.getHttpUrl(`/stream/${track.id}`);
    if (buffered) {
      const localPath = OfflineBufferService.getLocalPath(track.id);
      if (localPath) url = `file://${localPath}`;
    }

    const playTrack = {
      ...track,
      url,
      artwork: route.params.albumArt || null,
      headers: {
        'Bypass-Tunnel-Reminder': 'true',
        'User-Agent': 'localtunnel'
      }
    };

    await PlayerService.loadTrack(playTrack, startMs);
    await PlayerService.play();

    // Queue offline download if not buffered and online
    if (!buffered && mode === 'online') {
      OfflineBufferService.queueDownload(
        track.id,
        url,
        track.filename || `${track.id}.m4b`,
        track.fileSize || 0
      );
    }
  };

  const _startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(artworkPulse, { toValue: 1.02, duration: 2000, useNativeDriver: true }),
        Animated.timing(artworkPulse, { toValue: 1.0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  };

  const _stopPulse = () => {
    artworkPulse.stopAnimation();
    Animated.timing(artworkPulse, { toValue: 1.0, duration: 200, useNativeDriver: true }).start();
  };

  const handlePlayPause = useCallback(async () => {
    if (isPlaying) await PlayerService.pause();
    else await PlayerService.play();
  }, [isPlaying]);

  const handleSeekStart = () => setSeeking(true);
  const handleSeekEnd = async (value) => {
    const targetMs = value * durationMs;
    setPositionMs(targetMs);
    await PlayerService.seekToMs(targetMs);
    setSeeking(false);
  };

  const handleSetSleep = (minutes) => {
    setSleepMinutes(minutes);
    PlayerService.setSleepTimer(minutes, () => setSleepMinutes(0));
  };

  const handleClearSleep = () => {
    PlayerService.clearSleepTimer();
    setSleepMinutes(0);
    setSleepFading(false);
  };

  const handleSpeedCycle = async () => {
    const nextIdx = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(nextIdx);
    await PlayerService.setRate(SPEEDS[nextIdx]);
  };

  const handleBookmark = () => {
    if (!track) return;
    Alert.alert(
      'Bookmark',
      `Seal timestamp at ${formatTime(positionMs / 1000)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Seal',
          onPress: () => {
            MediaSyncService.send('BOOKMARK_SEAL', {
              track_id: track.id,
              position_ms: positionMs,
              timestamp: Date.now(),
            });
            Alert.alert('✓', 'Timestamp sealed to VERITAS ledger');
          }
        }
      ]
    );
  };

  const progress = durationMs > 0 ? positionMs / durationMs : 0;

  return (
    <View style={styles.container}>

      {/* Background glow */}
      <View style={styles.bgGlow} />

      {/* Omega watermark */}
      <Text style={styles.watermark}>Ω</Text>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerMid}>
          <Text style={styles.headerLabel}>NOW PLAYING</Text>
          <View style={[styles.modePill, { borderColor: mode === 'online' ? colors.green : colors.gold }]}>
            <Text style={[styles.modePillText, { color: mode === 'online' ? colors.green : colors.gold }]}>
              {mode === 'online' ? '⚡ STREAM' : '⬡ BUFFER'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={handleBookmark}>
          <Text style={styles.bookmarkBtn}>⚑</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
      >
        {/* Artwork */}
        <Animated.View style={[styles.artworkContainer, { transform: [{ scale: artworkPulse }] }]}>
          <View style={styles.artworkShadow}>
            {track?.artwork ? (
              <Image 
                source={{ 
                  uri: track.artwork,
                  headers: {
                    'Bypass-Tunnel-Reminder': 'true',
                    'User-Agent': 'localtunnel'
                  }
                }} 
                style={styles.artwork} 
                resizeMode="cover" 
              />
            ) : (
              <View style={styles.artworkPlaceholder}>
                <Text style={styles.artworkPlaceholderIcon}>Ω</Text>
              </View>
            )}
            <View style={styles.artworkOverlay} />
          </View>
        </Animated.View>

        {/* Track info */}
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={2}>
            {track?.title || 'Unknown Title'}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {track?.artist || ''}
          </Text>
          {track?.album && (
            <Text style={styles.trackAlbum} numberOfLines={1}>{track.album}</Text>
          )}
        </View>

        {/* Sleep fade indicator */}
        {sleepFading && (
          <View style={styles.fadingBanner}>
            <Text style={styles.fadingText}>🌙 Fading out...</Text>
          </View>
        )}

        {/* Progress bar */}
        <View style={styles.progressSection}>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={progress}
            minimumTrackTintColor={colors.gold}
            maximumTrackTintColor={colors.obsidianMid}
            thumbTintColor={colors.gold}
            onSlidingStart={handleSeekStart}
            onSlidingComplete={handleSeekEnd}
          />
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(positionMs / 1000)}</Text>
            <Text style={styles.timeText}>{formatTime(durationMs / 1000)}</Text>
          </View>
        </View>

        {/* Transport controls */}
        <View style={styles.transport}>
          <TactileButton icon="↩" onPress={() => PlayerService.skipBackward(30)} size={44} />
          <TactileButton icon="⏮" onPress={() => PlayerService.skipBackward(10)} size={48} />
          <TactileButton
            icon={isPlaying ? '⏸' : '▶'}
            onPress={handlePlayPause}
            size={70}
            primary
          />
          <TactileButton icon="⏭" onPress={() => PlayerService.skipForward(30)} size={48} />
          <TactileButton icon="↪" onPress={() => PlayerService.skipForward(60)} size={44} />
        </View>

        {/* Secondary controls */}
        <View style={styles.secondaryControls}>
          {/* Speed */}
          <TouchableOpacity style={styles.controlBtn} onPress={handleSpeedCycle}>
            <Text style={styles.controlBtnText}>{SPEEDS[speedIdx]}×</Text>
          </TouchableOpacity>

          {/* Chapters 
          (Temporarily Disabled as ExoPlayer doesn't natively parse m4b chapters without an external library)
          */}

          {/* Sleep timer */}
          <TouchableOpacity
            style={[styles.controlBtn, sleepMinutes > 0 && styles.controlBtnActive]}
            onPress={() => setShowSleepTimer(true)}
          >
            <Text style={styles.controlBtnIcon}>🌙</Text>
            <Text style={styles.controlBtnLabel}>
              {sleepMinutes > 0 ? `${sleepMinutes}m` : 'SLEEP'}
            </Text>
          </TouchableOpacity>

          {/* Buffer status */}
          <View style={styles.controlBtn}>
            <Text style={styles.controlBtnIcon}>{isBuffered ? '⬡' : '☁'}</Text>
            <Text style={styles.controlBtnLabel}>{isBuffered ? 'LOCAL' : 'REMOTE'}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Chapter drawer modal */}
      <Modal
        visible={showChapters}
        transparent
        animationType="slide"
        onRequestClose={() => setShowChapters(false)}
      >
        <TouchableOpacity style={styles.drawerOverlay} activeOpacity={1} onPress={() => setShowChapters(false)}>
          <View style={styles.drawerSheet}>
            <ChapterDrawer
              chapters={chapters}
              currentPositionMs={positionMs}
              onSeek={(ms) => PlayerService.seekToMs(ms)}
              onClose={() => setShowChapters(false)}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Sleep timer modal */}
      <Modal
        visible={showSleepTimer}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSleepTimer(false)}
      >
        <TouchableOpacity style={styles.drawerOverlay} activeOpacity={1} onPress={() => setShowSleepTimer(false)}>
          <View style={styles.drawerSheet}>
            <SleepTimerPicker
              currentMinutes={sleepMinutes}
              onSet={handleSetSleep}
              onClear={handleClearSleep}
              onClose={() => setShowSleepTimer(false)}
            />
          </View>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.obsidian },

  bgGlow: {
    position: 'absolute',
    top: H * 0.2,
    left: W * 0.1,
    width: W * 0.8,
    height: W * 0.8,
    borderRadius: W * 0.4,
    backgroundColor: colors.goldGlow,
  },

  watermark: {
    position: 'absolute',
    bottom: H * 0.1,
    alignSelf: 'center',
    fontSize: 200,
    color: 'rgba(212,175,55,0.04)',
    fontFamily: 'Courier New',
    fontWeight: 'bold',
    zIndex: 0,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingTop: spacing.xl,
    zIndex: 1,
  },
  backBtn: { fontSize: 28, color: colors.gold, width: 40 },
  headerMid: { flex: 1, alignItems: 'center', gap: spacing.xs },
  headerLabel: { fontFamily: 'Courier New', fontSize: 9, letterSpacing: 3, color: colors.goldDim },
  modePill: {
    borderWidth: 1, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 2,
  },
  modePillText: { fontFamily: 'Courier New', fontSize: 8, letterSpacing: 1 },
  bookmarkBtn: { fontSize: 22, color: colors.goldDim, width: 40, textAlign: 'right' },

  scroll: { flex: 1, zIndex: 1 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },

  artworkContainer: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    alignSelf: 'center',
    marginVertical: spacing.xl,
  },
  artworkShadow: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: radius.lg,
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderBright,
  },
  artwork: { width: ARTWORK_SIZE, height: ARTWORK_SIZE },
  artworkPlaceholder: {
    width: ARTWORK_SIZE, height: ARTWORK_SIZE,
    backgroundColor: colors.obsidianMid,
    alignItems: 'center', justifyContent: 'center',
  },
  artworkPlaceholderIcon: { fontSize: 80, color: colors.goldDim, transform: [{ scaleY: 1.2 }, { scaleX: 1.1 }] },
  artworkOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
  },

  trackInfo: { alignItems: 'center', marginBottom: spacing.lg },
  trackTitle: {
    fontFamily: 'Courier New', fontSize: 16, color: colors.text,
    textAlign: 'center', lineHeight: 24, fontWeight: '600',
  },
  trackArtist: { fontFamily: 'Courier New', fontSize: 11, color: colors.gold, marginTop: spacing.sm },
  trackAlbum: { fontFamily: 'Courier New', fontSize: 10, color: colors.textDim, marginTop: 2 },

  fadingBanner: {
    backgroundColor: 'rgba(212,175,55,0.1)',
    borderWidth: 1, borderColor: colors.gold,
    borderRadius: radius.sm, padding: spacing.sm,
    alignItems: 'center', marginBottom: spacing.md,
  },
  fadingText: { fontFamily: 'Courier New', fontSize: 11, color: colors.gold },

  progressSection: { marginBottom: spacing.xl },
  slider: { width: '100%', height: 40 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -spacing.sm },
  timeText: { fontFamily: 'Courier New', fontSize: 10, color: colors.textDim },

  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },

  tactileBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.obsidianMid,
    borderWidth: 1, borderColor: colors.border,
  },
  tactileBtnPrimary: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
  },
  tactileBtnIcon: { color: colors.text },

  secondaryControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.md,
  },
  controlBtn: { alignItems: 'center', gap: spacing.xs, padding: spacing.sm },
  controlBtnActive: { backgroundColor: colors.goldFaint, borderRadius: radius.sm },
  controlBtnText: { fontFamily: 'Courier New', fontSize: 13, color: colors.text, fontWeight: '600' },
  controlBtnIcon: { fontSize: 18 },
  controlBtnLabel: { fontFamily: 'Courier New', fontSize: 8, color: colors.textDim, letterSpacing: 1 },

  // Drawer
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  drawerSheet: { backgroundColor: colors.obsidianLight, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: H * 0.75 },
  drawerContainer: { padding: spacing.lg },
  drawerHandle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.md },
  drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  drawerTitle: { ...typography.title, fontSize: 11 },
  drawerClose: { fontSize: 16, color: colors.goldDim },
  drawerList: { maxHeight: H * 0.5 },

  chapterRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md, borderRadius: radius.sm },
  chapterRowActive: { backgroundColor: colors.goldFaint },
  chapterDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  chapterDotActive: { backgroundColor: colors.gold },
  chapterInfo: { flex: 1 },
  chapterTitle: { fontFamily: 'Courier New', fontSize: 11, color: colors.text },
  chapterTitleActive: { color: colors.gold },
  chapterTime: { fontFamily: 'Courier New', fontSize: 9, color: colors.textDim, marginTop: 2 },
  chapterNowPlaying: { color: colors.gold, fontSize: 10 },

  pickerContainer: { padding: spacing.lg },
  clearTimerBtn: { backgroundColor: colors.redDim, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md, alignItems: 'center' },
  clearTimerText: { fontFamily: 'Courier New', fontSize: 11, color: colors.red },
  sleepOption: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sleepOptionActive: { backgroundColor: colors.goldFaint },
  sleepOptionText: { fontFamily: 'Courier New', fontSize: 13, color: colors.text, letterSpacing: 1 },
});
