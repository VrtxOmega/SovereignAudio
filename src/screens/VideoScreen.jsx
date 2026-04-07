/**
 * VideoScreen.jsx — Video tab. TV show hierarchy, continue watching row,
 * effective position algorithm, hardware-accelerated playback.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Modal, StatusBar, ActivityIndicator,
  RefreshControl, Animated, TouchableWithoutFeedback,
} from 'react-native';
import FastImage from 'react-native-fast-image';
import Video from 'react-native-video';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONTS, SPACING, RADIUS } from '../theme/veritas';
import MediaSyncService from '../services/MediaSyncService';

const { width: W, height: H } = Dimensions.get('window');
const CONTINUE_CARD_W = W * 0.45;
const GRID_CARD_W     = (W - SPACING.md * 3) / 2;
const POS_KEY_PREFIX  = '@sovereign_vid_pos_';
const COMPLETION_PCT  = 0.95;
const MIN_TRACK_PCT   = 10 / 1000; // 10 seconds minimum

function formatMs(ms) {
  if (!ms) return '';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
  return `${m}:${String(s % 60).padStart(2,'0')}`;
}

// ─── Video Player Modal ───────────────────────────────────────────────────

function VideoPlayer({ item, visible, onClose }) {
  const videoRef    = useRef(null);
  const [paused,    setPaused]    = useState(false);
  const [pos,       setPos]       = useState(0);
  const [duration,  setDuration]  = useState(0);
  const resumePos   = useRef(0);
  const saveTimer   = useRef(null);
  const hideTimer   = useRef(null);
  const overlayAnim = useRef(new Animated.Value(1)).current;
  const [controlsVisible, setControlsVisible] = useState(true);

  const HIDE_DELAY = 4000;

  // Load saved position when player opens
  useEffect(() => {
    if (visible && item) {
      setControlsVisible(true);
      overlayAnim.setValue(1);
      scheduleHide();
      AsyncStorage.getItem(`${POS_KEY_PREFIX}${item.id || item.path}`)
        .then(v => {
          const savedMs = v ? parseInt(v) : (item.lastPositionMs || 0);
          resumePos.current = savedMs / 1000;
        });
    }
    return () => clearTimeout(hideTimer.current);
  }, [visible, item]);

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => setControlsVisible(false));
    }, HIDE_DELAY);
  }, [overlayAnim]);

  const showControls = useCallback(() => {
    clearTimeout(hideTimer.current);
    setControlsVisible(true);
    overlayAnim.setValue(1);
    scheduleHide();
  }, [overlayAnim, scheduleHide]);

  const toggleControls = useCallback(() => {
    if (controlsVisible) {
      clearTimeout(hideTimer.current);
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setControlsVisible(false));
    } else {
      showControls();
    }
  }, [controlsVisible, overlayAnim, showControls]);

  const onProgress = useCallback(({ currentTime }) => {
    setPos(currentTime);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const ms = Math.round(currentTime * 1000);
      await AsyncStorage.setItem(`${POS_KEY_PREFIX}${item.id || item.path}`, String(ms));
      MediaSyncService.postPlayhead(item.id || item.path, ms, 'video');
    }, 5000);
  }, [item]);

  const onLoad = useCallback(({ duration: d }) => {
    setDuration(d);
    // Seek to saved position once video is loaded and ready
    if (resumePos.current > 0) {
      videoRef.current?.seek(resumePos.current);
      resumePos.current = 0; // Clear so reloads don't re-seek
    }
  }, []);

  const onEnd = useCallback(async () => {
    await AsyncStorage.setItem(`${POS_KEY_PREFIX}${item.id || item.path}`, '0');
    MediaSyncService.postPlayhead(item.id || item.path, 0, 'video');
    onClose();
  }, [item, onClose]);

  const seekForward = () => { videoRef.current?.seek(pos + 30); showControls(); };
  const seekBackward = () => { videoRef.current?.seek(Math.max(0, pos - 15)); showControls(); };
  const togglePause = () => { setPaused(p => !p); showControls(); };
  const handleClose = () => { clearTimeout(hideTimer.current); onClose(); };

  const progress = duration > 0 ? pos / duration : 0;

  if (!visible || !item) return null;

  const streamUrl = MediaSyncService.buildStreamUrl(item.path) || item.localPath;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <StatusBar hidden />
      <View style={styles.playerRoot}>
        <Video
          ref={videoRef}
          source={{
            uri: streamUrl,
            headers: MediaSyncService.getRequestHeaders(),
          }}
          style={styles.video}
          resizeMode="contain"
          paused={paused}
          onProgress={onProgress}
          onLoad={onLoad}
          onEnd={onEnd}
          bufferConfig={{
            minBufferMs: 15000,
            maxBufferMs: 50000,
            bufferForPlaybackMs: 2500,
          }}
          useTextureView={false}
          controls={false}
        />

        {/* Tap zone to toggle controls */}
        <TouchableWithoutFeedback onPress={toggleControls}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>

        {/* Overlay controls — animated fade */}
        {controlsVisible && (
          <Animated.View style={[styles.playerOverlay, { opacity: overlayAnim }]} pointerEvents="box-none">
            <TouchableOpacity style={styles.playerClose} onPress={handleClose}>
              <Text style={styles.playerCloseText}>✕</Text>
            </TouchableOpacity>

            <Text style={styles.playerTitle}>{item.title || item.filename}</Text>

            <View style={styles.playerControls}>
              <TouchableOpacity onPress={seekBackward} style={styles.ctrlBtn}>
                <Text style={styles.ctrlText}>-15</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={togglePause} style={styles.ctrlPlay}>
                <Text style={styles.ctrlPlayText}>{paused ? '▶' : '⏸'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={seekForward} style={styles.ctrlBtn}>
                <Text style={styles.ctrlText}>+30</Text>
              </TouchableOpacity>
            </View>

            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{formatMs(pos * 1000)}</Text>
              <Text style={styles.timeText}>{formatMs(duration * 1000)}</Text>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

// ─── Continue Watching Card ───────────────────────────────────────────────

function ContinueCard({ item, onPress }) {
  const pct = item.durationMs ? (item.lastPositionMs / item.durationMs) : 0;
  return (
    <TouchableOpacity style={styles.continueCard} onPress={() => onPress(item)} activeOpacity={0.85}>
      <FastImage
        style={styles.continueCover}
        source={{
          uri: MediaSyncService.buildCoverUrl(item.coverHash) || item.thumbnail,
          headers: MediaSyncService.getRequestHeaders(),
        }}
        resizeMode={FastImage.resizeMode.cover}
      />
      <View style={styles.continueProgress}>
        <View style={[styles.continueFill, { width: `${pct * 100}%` }]} />
      </View>
      <View style={styles.continueInfo}>
        <Text style={styles.continueTitle} numberOfLines={1}>{item.title || item.filename}</Text>
        <Text style={styles.continuePos}>{formatMs(item.lastPositionMs)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Video Grid Card ──────────────────────────────────────────────────────

function VideoCard({ item, onPress }) {
  return (
    <TouchableOpacity style={styles.gridCard} onPress={() => onPress(item)} activeOpacity={0.85}>
      <FastImage
        style={styles.gridCover}
        source={{
          uri: MediaSyncService.buildCoverUrl(item.coverHash) || item.thumbnail,
          headers: MediaSyncService.getRequestHeaders(),
        }}
        resizeMode={FastImage.resizeMode.cover}
      />
      {item.type === 'tv' && (
        <View style={styles.tvBadge}>
          <Text style={styles.tvBadgeText}>TV</Text>
        </View>
      )}
      <View style={styles.gridInfo}>
        <Text style={styles.gridTitle} numberOfLines={2}>{item.show || item.title || item.filename}</Text>
        {item.type === 'tv' && (
          <Text style={styles.gridSub}>{item.episodeCount} episodes</Text>
        )}
        {item.durationMs && <Text style={styles.gridDur}>{formatMs(item.durationMs)}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ─── TV Show Episodes Modal ───────────────────────────────────────────────

function ShowModal({ show, visible, onClose, onPlayEpisode }) {
  if (!visible || !show) return null;
  const seasons = {};
  (show.episodes || []).forEach(ep => {
    const s = ep.season || 1;
    if (!seasons[s]) seasons[s] = [];
    seasons[s].push(ep);
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.showRoot}>
        <View style={styles.showHeader}>
          <TouchableOpacity onPress={onClose}><Text style={styles.closeText}>✕</Text></TouchableOpacity>
          <Text style={styles.showTitle}>{show.show}</Text>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {Object.entries(seasons).sort(([a],[b]) => Number(a)-Number(b)).map(([season, episodes]) => (
            <View key={season}>
              <Text style={styles.seasonLabel}>SEASON {season}</Text>
              {episodes.map(ep => (
                <TouchableOpacity key={ep.id || ep.path} style={styles.epRow} onPress={() => { onClose(); onPlayEpisode(ep); }}>
                  <View style={styles.epLeft}>
                    <Text style={styles.epNum}>E{String(ep.episode).padStart(2,'0')}</Text>
                    <Text style={styles.epTitle} numberOfLines={1}>{ep.title || ep.filename}</Text>
                  </View>
                  <Text style={styles.epDur}>{formatMs(ep.durationMs)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main VideoScreen ─────────────────────────────────────────────────────

export default function VideoScreen() {
  const [allItems,    setAllItems]    = useState([]);
  const [continuing,  setContinuing]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [activeItem,  setActiveItem]  = useState(null);
  const [playerOpen,  setPlayerOpen]  = useState(false);
  const [activeShow,  setActiveShow]  = useState(null);
  const [showOpen,    setShowOpen]    = useState(false);

  useEffect(() => {
    const unsub = MediaSyncService.on('manifest', processManifest);
    const existing = MediaSyncService.getManifest();
    if (existing?.Video) processManifest(existing);
    return unsub;
  }, []);

  const processManifest = useCallback((manifest) => {
    const raw = manifest?.Video || [];

    // Group TV episodes
    const showMap = {};
    const movies  = [];

    raw.forEach(item => {
      if (item.type === 'tv' && item.show) {
        if (!showMap[item.show]) {
          showMap[item.show] = {
            id:           `show_${item.show}`,
            type:         'tv',
            show:         item.show,
            thumbnail:    item.thumbnail,
            coverHash:    item.coverHash,
            episodes:     [],
            episodeCount: 0,
          };
        }
        showMap[item.show].episodes.push(item);
        showMap[item.show].episodeCount++;
        // Inherit cover from first episode if missing
        if (!showMap[item.show].thumbnail && item.thumbnail) {
          showMap[item.show].thumbnail = item.thumbnail;
        }
      } else {
        movies.push(item);
      }
    });

    const grouped = [...Object.values(showMap), ...movies];
    setAllItems(grouped);

    // Continue watching: items with position > 10s and < 95% complete
    const cont = raw.filter(item => {
      const posMs = item.lastPositionMs || 0;
      const durMs = item.durationMs || 0;
      if (posMs < 10000) return false;
      if (durMs > 0 && posMs / durMs >= COMPLETION_PCT) return false;
      return true;
    }).sort((a, b) => (b.lastPlayedAt || 0) - (a.lastPlayedAt || 0));

    setContinuing(cont);
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await MediaSyncService.refreshManifest();
    setRefreshing(false);
  }, []);

  const playItem = useCallback((item) => {
    setActiveItem(item);
    setPlayerOpen(true);
  }, []);

  const onGridPress = useCallback((item) => {
    if (item.type === 'tv') {
      setActiveShow(item);
      setShowOpen(true);
    } else {
      playItem(item);
    }
  }, [playItem]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={COLORS.gold} size="large" />
        <Text style={styles.loadingText}>LOADING LIBRARY...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.gold} />}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Continue Watching */}
        {continuing.length > 0 && (
          <View style={styles.continueSection}>
            <Text style={styles.sectionLabel}>CONTINUE WATCHING</Text>
            <FlatList
              horizontal
              data={continuing}
              keyExtractor={item => item.id || item.path}
              renderItem={({ item }) => <ContinueCard item={item} onPress={playItem} />}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: SPACING.md }}
            />
          </View>
        )}

        {/* Full Library Grid */}
        <Text style={styles.sectionLabel}>LIBRARY</Text>
        <View style={styles.grid}>
          {allItems.map(item => (
            <VideoCard key={item.id || item.path} item={item} onPress={onGridPress} />
          ))}
        </View>
      </ScrollView>

      <VideoPlayer
        item={activeItem}
        visible={playerOpen}
        onClose={() => setPlayerOpen(false)}
      />

      <ShowModal
        show={activeShow}
        visible={showOpen}
        onClose={() => setShowOpen(false)}
        onPlayEpisode={playItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.obsidian },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.obsidian },
  loadingText: { color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 2, marginTop: SPACING.md },

  sectionLabel: {
    color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 11,
    letterSpacing: 3, paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md, paddingBottom: SPACING.sm,
  },

  continueSection: { marginBottom: SPACING.md },
  continueCard: {
    width: CONTINUE_CARD_W, marginRight: SPACING.sm,
    backgroundColor: COLORS.obsidianCard, borderRadius: RADIUS.md,
    overflow: 'hidden', borderWidth: 1, borderColor: COLORS.obsidianBorder,
  },
  continueCover:    { width: CONTINUE_CARD_W, height: CONTINUE_CARD_W * 0.56 },
  continueProgress: { height: 2, backgroundColor: COLORS.obsidianBorder },
  continueFill:     { height: 2, backgroundColor: COLORS.gold },
  continueInfo:     { padding: SPACING.sm },
  continueTitle:    { color: COLORS.textPrimary, fontFamily: FONTS.mono, fontSize: 11 },
  continuePos:      { color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 10, marginTop: 2 },

  grid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: SPACING.md, gap: SPACING.md,
  },
  gridCard: {
    width: GRID_CARD_W, backgroundColor: COLORS.obsidianCard,
    borderRadius: RADIUS.md, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.obsidianBorder,
  },
  gridCover: { width: GRID_CARD_W, height: GRID_CARD_W * 0.56 },
  tvBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: COLORS.gold, borderRadius: RADIUS.sm,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  tvBadgeText: { color: COLORS.obsidian, fontFamily: FONTS.mono, fontSize: 9, fontWeight: 'bold' },
  gridInfo:    { padding: SPACING.sm },
  gridTitle:   { color: COLORS.textPrimary, fontFamily: FONTS.mono, fontSize: 12 },
  gridSub:     { color: COLORS.textDim, fontFamily: FONTS.mono, fontSize: 10, marginTop: 2 },
  gridDur:     { color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 10, marginTop: 2 },

  // Player
  playerRoot:    { flex: 1, backgroundColor: '#000' },
  video:         { flex: 1 },
  playerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  playerClose:     { alignSelf: 'flex-start' },
  playerCloseText: { color: '#fff', fontSize: 22, fontFamily: FONTS.mono },
  playerTitle:     { color: '#fff', fontFamily: FONTS.mono, fontSize: 14, textAlign: 'center' },
  playerControls:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  ctrlBtn:    { padding: SPACING.md },
  ctrlText:   { color: '#fff', fontFamily: FONTS.mono, fontSize: 14 },
  ctrlPlay:   { marginHorizontal: SPACING.xl, padding: SPACING.md },
  ctrlPlayText:{ color: COLORS.gold, fontSize: 32, fontFamily: FONTS.mono },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2 },
  progressFill:  { height: 3, backgroundColor: COLORS.gold, borderRadius: 2 },
  timeRow:       { flexDirection: 'row', justifyContent: 'space-between' },
  timeText:      { color: 'rgba(255,255,255,0.6)', fontFamily: FONTS.mono, fontSize: 11 },

  // Show modal
  showRoot:   { flex: 1, backgroundColor: COLORS.obsidian },
  showHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.gold,
  },
  closeText:    { color: COLORS.gold, fontSize: 18, fontFamily: FONTS.mono, marginRight: SPACING.md },
  showTitle:    { color: COLORS.textPrimary, fontFamily: FONTS.mono, fontSize: 15 },
  seasonLabel:  {
    color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 2,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm,
  },
  epRow:  {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.obsidianBorder,
  },
  epLeft:  { flex: 1, flexDirection: 'row', alignItems: 'center' },
  epNum:   { color: COLORS.gold, fontFamily: FONTS.mono, fontSize: 12, width: 36 },
  epTitle: { flex: 1, color: COLORS.textPrimary, fontFamily: FONTS.mono, fontSize: 12 },
  epDur:   { color: COLORS.textDim, fontFamily: FONTS.mono, fontSize: 11 },
});
