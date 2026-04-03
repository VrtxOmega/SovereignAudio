import React, { useCallback, useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Image, Dimensions } from 'react-native';
import { colors, spacing, radius, typography } from '../theme/veritas';
import MediaSyncService from '../services/MediaSyncService';

const { width: SCREEN_W } = Dimensions.get('window');

export default function AlbumScreen({ route, navigation }) {
  const { album } = route.params;
  const [tracks] = useState(album.tracks || []);
  const [vaultState, setVaultState] = useState('UNCACHED'); // UNCACHED | DOWNLOADING | VAULTED

  const coverUrl = MediaSyncService.getHttpUrl(`/cover/${album.id}`);

  useEffect(() => {
    import('../services/OfflineBufferService').then((module) => {
      const OfflineBufferService = module.default;
      
      const checkState = () => {
        let downloadedCount = 0;
        let isDownloading = false;
        
        tracks.forEach(track => {
          if (OfflineBufferService.isBuffered(track.id)) downloadedCount++;
          if (OfflineBufferService.queue.some(q => q.trackId === track.id) || 
              OfflineBufferService.currentDownload?.trackId === track.id) {
            isDownloading = true;
          }
        });

        if (downloadedCount === tracks.length && tracks.length > 0) setVaultState('VAULTED');
        else if (isDownloading) setVaultState('DOWNLOADING');
        else setVaultState('UNCACHED');
      };

      checkState();

      const unsubQueue = OfflineBufferService.on('queue_updated', checkState);
      const unsubStart = OfflineBufferService.on('download_start', checkState);
      const unsubDone = OfflineBufferService.on('download_complete', checkState);
      const unsubErr = OfflineBufferService.on('download_error', checkState);

      return () => {
        unsubQueue?.(); unsubStart?.(); unsubDone?.(); unsubErr?.();
      };
    });
  }, [tracks]);

  const handleTrackPress = useCallback((track) => {
    navigation.navigate('NowPlaying', { 
      track: { ...track, title: track.title || album.name }, 
      albumArt: coverUrl 
    });
  }, [navigation, coverUrl, album.name]);

  const handleDownloadPress = useCallback((track) => {
    const url = MediaSyncService.getHttpUrl(`/stream/${track.id}`);
    import('../services/OfflineBufferService').then((module) => {
      module.default.queueDownload(track.id, url, track.filename, track.duration * 1024 * 1024 || 0, {
        albumId: album.id,
        albumName: album.name,
        artist: album.artist,
        coverUrl: coverUrl,
        totalTracks: tracks.length
      });
    });
  }, [album, coverUrl, tracks.length]);

  const handleDownloadBook = useCallback(() => {
    if (vaultState !== 'UNCACHED') return;
    import('../services/OfflineBufferService').then((module) => {
      tracks.forEach(track => {
        const url = MediaSyncService.getHttpUrl(`/stream/${track.id}`);
        module.default.queueDownload(track.id, url, track.filename, track.duration * 1024 * 1024 || 0, {
          albumId: album.id,
          albumName: album.name,
          artist: album.artist,
          coverUrl: coverUrl,
          totalTracks: tracks.length
        }, true); // isPersistent = true
      });
      setVaultState('DOWNLOADING');
    });
  }, [tracks, album, coverUrl, vaultState]);

  const renderTrackItem = useCallback(({ item, index }) => (
    <View style={styles.trackItem}>
      <TouchableOpacity 
        style={styles.trackTouchable} 
        onPress={() => handleTrackPress(item)}
      >
        <Text style={styles.trackIndex}>{index + 1}.</Text>
        <View style={styles.trackInfo}>
          <Text style={styles.trackTitle} numberOfLines={1}>{item.title || album.name}</Text>
        </View>
        <Text style={styles.trackDuration}>
          {item.duration ? `${Math.floor(item.duration / 60)}:${(item.duration % 60).toString().padStart(2, '0')}` : '0:00'}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity 
        style={styles.downloadBtn} 
        onPress={() => handleDownloadPress(item)}
      >
        <Text style={styles.downloadBtnText}>⬡</Text>
      </TouchableOpacity>
    </View>
  ), [handleTrackPress, handleDownloadPress]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>◀</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{album.name}</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.albumMeta}>
        <Image 
          source={{ 
            uri: coverUrl, 
            headers: { 
              'Bypass-Tunnel-Reminder': 'true', 
              'User-Agent': 'localtunnel' 
            } 
          }} 
          style={styles.albumCover} 
          defaultSource={null} 
        />
        <Text style={styles.albumArtist}>{album.artist || 'Unknown Artist'}</Text>
        <Text style={styles.albumCount}>{tracks.length} episodes/tracks</Text>
        
        <TouchableOpacity 
          style={[
            styles.downloadBookBtn, 
            vaultState === 'VAULTED' && styles.downloadBookBtnVaulted,
            vaultState === 'DOWNLOADING' && styles.downloadBookBtnWait
          ]} 
          onPress={handleDownloadBook}
          activeOpacity={vaultState === 'UNCACHED' ? 0.7 : 1}
        >
          <Text style={[
            styles.downloadBookBtnText,
            vaultState === 'VAULTED' && { color: colors.obsidian }
          ]}>
            {vaultState === 'VAULTED' ? '✓ VAULTED OFFLINE' : vaultState === 'DOWNLOADING' ? '⚡ DOWNLOADING...' : '⚡ DOWNLOAD BOOK'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={tracks}
        renderItem={renderTrackItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.trackList}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.obsidian },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: 50,
    backgroundColor: colors.obsidianLight,
  },
  backBtn: { padding: spacing.sm, marginRight: spacing.sm },
  backBtnText: { color: colors.gold, fontSize: 18 },
  headerTitle: { flex: 1, ...typography.title, fontSize: 14, color: colors.text, textAlign: 'center' },
  spacer: { width: 40 },
  
  albumMeta: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.obsidianLight,
  },
  albumCover: {
    width: SCREEN_W * 0.45,
    height: SCREEN_W * 0.45,
    borderRadius: radius.md,
    backgroundColor: colors.obsidianLight,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  albumArtist: { fontFamily: 'Courier New', fontSize: 13, color: colors.gold, letterSpacing: 1, marginBottom: 4 },
  albumCount: { fontFamily: 'Courier New', fontSize: 10, color: colors.textDim },

  trackList: { padding: spacing.md, paddingBottom: 100 },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.obsidianLight,
  },
  trackTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackIndex: { fontFamily: 'Courier New', fontSize: 11, color: colors.textFaint, width: 30 },
  trackInfo: { flex: 1, paddingRight: spacing.sm },
  trackTitle: { fontFamily: 'Courier New', fontSize: 13, color: colors.text },
  trackDuration: { fontFamily: 'Courier New', fontSize: 11, color: colors.goldDim, marginRight: spacing.md },
  
  downloadBtn: {
    padding: spacing.sm,
  },
  downloadBtnText: {
    color: colors.gold,
    fontSize: 18,
  },
  downloadBookBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.obsidianMid,
    borderWidth: 1,
    borderColor: colors.gold,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  downloadBookBtnWait: {
    borderColor: colors.goldDim,
    backgroundColor: colors.obsidian,
  },
  downloadBookBtnVaulted: {
    backgroundColor: colors.gold,
    borderColor: colors.gold,
  },
  downloadBookBtnText: {
    fontFamily: 'Courier New',
    fontSize: 11,
    color: colors.gold,
    fontWeight: 'bold',
    letterSpacing: 2,
  }
});
