import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, Dimensions, Image, RefreshControl,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/veritas';
import MediaSyncService from '../services/MediaSyncService';

const { width: SCREEN_W } = Dimensions.get('window');
const COLS = 2; // Bigger cards for albums
const CARD_SIZE = (SCREEN_W - spacing.lg * 2 - spacing.sm * (COLS - 1)) / COLS;

const AlbumCard = React.memo(({ album, onPress }) => {
  const coverUri = MediaSyncService.getHttpUrl(`/cover/${album.id}`);
  
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(album)}
      activeOpacity={0.7}
    >
      <View style={styles.coverWrapper}>
        <Image 
          source={{ uri: coverUri }} 
          style={styles.cover} 
          resizeMode="cover" 
          defaultSource={null}
        />
        <View style={styles.coverBorder} />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>{album.name}</Text>
        <Text style={styles.cardArtist} numberOfLines={1}>{album.artist || 'Podcast'}</Text>
      </View>
    </TouchableOpacity>
  );
});

const ModeIndicator = ({ mode }) => (
  <View style={[styles.modeBadge, { borderColor: mode === 'online' ? colors.green : colors.gold }]}>
    <View style={[styles.modeDot, { backgroundColor: mode === 'online' ? colors.green : colors.gold }]} />
    <Text style={[styles.modeText, { color: mode === 'online' ? colors.green : colors.gold }]}>
      {mode === 'online' ? 'STREAM' : 'BUFFER'}
    </Text>
  </View>
);

export default function LibraryScreen({ navigation }) {
  const [albums, setAlbums] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [mode, setMode] = useState(MediaSyncService.mode || 'offline');

  useEffect(() => {
    const unsubLib = MediaSyncService.on('LIBRARY_RESPONSE', (data) => {
      const albumList = data.albums || [];
      setAlbums(albumList);
      setFiltered(albumList);
      setRefreshing(false);
      setErrorMsg(null);
    });

    const unsubError = MediaSyncService.on('LIBRARY_ERROR', (msg) => {
      setErrorMsg(msg);
      setRefreshing(false);
    });

    const unsubMode = MediaSyncService.on('mode_change', ({ mode }) => {
      setMode(mode);
    });

    MediaSyncService.fetchLibrary();

    return () => { unsubLib(); unsubError(); unsubMode(); };
  }, []);

  useEffect(() => {
    let result = [...albums];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.name?.toLowerCase().includes(q) ||
        a.artist?.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    setFiltered(result);
  }, [search, albums]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    MediaSyncService.fetchLibrary().finally(() => setRefreshing(false));
  }, []);

  const handleAlbumPress = useCallback((album) => {
    navigation.navigate('Album', { album });
  }, [navigation]);

  const renderAlbum = useCallback(({ item }) => (
    <AlbumCard album={item} onPress={handleAlbumPress} />
  ), [handleAlbumPress]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.headerTitle}>LIBRARY</Text>
            <Text style={styles.headerCount}>{filtered.length} collections</Text>
          </View>
          <ModeIndicator mode={mode} />
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search podcasts & series..."
            placeholderTextColor={colors.textFaint}
          />
        </View>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {refreshing ? 'Syncing...' : (errorMsg ? 'Sync Failed' : 'Library Empty')}
          </Text>
          {errorMsg && <Text style={{color: colors.red, marginTop: 10, textAlign: 'center'}}>{errorMsg}</Text>}
        </View>
      ) : (
        <FlatList
          data={filtered}
          renderItem={renderAlbum}
          keyExtractor={a => a.id}
          numColumns={COLS}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}
          showsVerticalScrollIndicator={false}
        />
      )}
      
      <FloatingMediaBar navigation={navigation} />
    </View>
  );
}

function FloatingMediaBar({ navigation }) {
  const { useActiveTrack } = require('react-native-track-player');
  const activeTrack = useActiveTrack();
  
  if (!activeTrack) return null;
  
  return (
    <TouchableOpacity 
      style={styles.floatingBar}
      activeOpacity={0.9}
      onPress={() => navigation.navigate('NowPlaying', { 
        track: {
          id: activeTrack.id,
          title: activeTrack.title,
          url: activeTrack.url,
          artist: activeTrack.artist,
        },
        albumArt: activeTrack.artwork 
      })}
    >
      <View style={styles.floatingBarContent}>
        {activeTrack.artwork && (
          <Image source={{ uri: activeTrack.artwork }} style={styles.floatingArt} />
        )}
        <View style={styles.floatingTextCol}>
          <Text style={styles.floatingTitle} numberOfLines={1}>{activeTrack.title}</Text>
          <Text style={styles.floatingSubtitle}>N O W   P L A Y I N G</Text>
        </View>
        <Text style={styles.floatingIcon}>▶</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.obsidian },
  header: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.obsidianLight, backgroundColor: colors.obsidian, zIndex: 10, paddingTop: 60 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  sortTabActive: { backgroundColor: colors.goldFaint },
  sortTabText: { fontFamily: 'Courier New', fontSize: 8, letterSpacing: 1, color: colors.textDim },
  sortTabTextActive: { color: colors.gold },

  grid: { padding: spacing.lg, paddingTop: spacing.md },
  row: { gap: spacing.sm, marginBottom: spacing.sm },

  card: {
    width: CARD_SIZE,
    backgroundColor: colors.obsidianMid,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  coverWrapper: {
    width: CARD_SIZE,
    height: CARD_SIZE,
    position: 'relative',
  },
  cover: { width: CARD_SIZE, height: CARD_SIZE },
  coverPlaceholder: {
    width: CARD_SIZE, height: CARD_SIZE,
    backgroundColor: colors.obsidian,
    alignItems: 'center', justifyContent: 'center',
  },
  coverPlaceholderIcon: { fontSize: 28, color: colors.goldDim },
  coverBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderWidth: 1, borderColor: colors.goldFaint,
  },
  offlineBadge: {
    position: 'absolute', bottom: 4, right: 4,
    backgroundColor: 'rgba(10,10,12,0.85)',
    borderRadius: 8, width: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.gold,
  },
  offlineBadgeText: { fontSize: 9, color: colors.gold },

  cardInfo: { padding: spacing.sm },
  cardTitle: { fontFamily: 'Courier New', fontSize: 9, color: colors.text, lineHeight: 13 },
  cardArtist: { fontFamily: 'Courier New', fontSize: 8, color: colors.goldDim, marginTop: 2 },
  cardDuration: { fontFamily: 'Courier New', fontSize: 8, color: colors.textFaint, marginTop: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  emptyIcon: { fontSize: 48, color: colors.goldDim, marginBottom: spacing.xl },
  emptyTitle: { fontFamily: 'Courier New', fontSize: 14, color: colors.text, letterSpacing: 2, marginBottom: spacing.sm },
  emptySub: { fontFamily: 'Courier New', fontSize: 10, color: colors.textDim, textAlign: 'center' },

  floatingBar: {
    position: 'absolute',
    bottom: 20,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: 'rgba(20,20,20,0.95)',
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  floatingBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
  },
  floatingArt: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.obsidianLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  floatingTextCol: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  floatingTitle: { ...typography.title, fontSize: 13, color: colors.text },
  floatingSubtitle: { fontFamily: 'Courier New', fontSize: 9, color: colors.goldDim, marginTop: 2, letterSpacing: 1 },
  floatingIcon: { fontSize: 16, color: colors.gold, paddingHorizontal: spacing.md },
});
