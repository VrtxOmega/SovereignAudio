import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Alert, ProgressBarAndroid,
} from 'react-native';
import { colors, spacing, radius, typography } from '../theme/veritas';
import OfflineBufferService from '../services/OfflineBufferService';
import StateLedgerService from '../services/StateLedgerService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const formatBytes = (bytes) => {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${Math.round(bytes / 1024 / 1024 * 10) / 10}MB`;
};

const BufferedTrackRow = ({ trackId, info, onDelete }) => (
  <View style={styles.trackRow}>
    <View style={styles.trackInfo}>
      <Text style={styles.trackId} numberOfLines={1}>{info.filename}</Text>
      <Text style={styles.trackMeta}>
        {formatBytes(info.size)} · {new Date(info.downloadedAt).toLocaleDateString()}
      </Text>
    </View>
    <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(trackId)}>
      <Text style={styles.deleteBtnText}>✕</Text>
    </TouchableOpacity>
  </View>
);

const OfflineBookCard = ({ book, onDelete }) => (
  <View style={styles.bookCard}>
    {book.coverUrl ? (
      <Image source={{ uri: book.coverUrl, headers: { 'Bypass-Tunnel-Reminder': 'true' } }} style={styles.bookCover} />
    ) : (
      <View style={styles.bookCoverPlaceholder}><Text style={styles.bookCoverText}>Ω</Text></View>
    )}
    <View style={styles.bookCardInfo}>
      <Text style={styles.bookCardTitle} numberOfLines={2}>{book.albumName}</Text>
      <Text style={styles.bookCardArtist} numberOfLines={1}>{book.artist || 'Unknown'}</Text>
      <Text style={styles.bookCardMeta}>
        {book.downloadedTracks} / {book.totalTracks} parts · {formatBytes(book.totalSize)}
      </Text>
    </View>
    <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(book.albumId, book.trackIds)}>
      <Text style={styles.deleteBtnText}>✕</Text>
    </TouchableOpacity>
  </View>
);

const LedgerRow = ({ session }) => {
  const duration = Math.round((session.totalListenedMs || 0) / 60000);
  return (
    <View style={styles.ledgerRow}>
      <View style={styles.sealIndicator} />
      <View style={styles.ledgerInfo}>
        <Text style={styles.ledgerTitle} numberOfLines={1}>{session.trackTitle}</Text>
        <Text style={styles.ledgerMeta}>
          {duration}min · {new Date(session.endedAt || session.startedAt).toLocaleDateString()}
        </Text>
        <Text style={styles.ledgerSeal} numberOfLines={1}>
          SEAL: {session.seal?.substr(0, 20)}...
        </Text>
      </View>
    </View>
  );
};

export default function DownloadsScreen() {
  const [bufferedTracks, setBufferedTracks] = useState({});
  const [offlineBooks, setOfflineBooks] = useState([]);
  const [transientSizeBytes, setTransientSizeBytes] = useState(0);
  const [persistentSizeBytes, setPersistentSizeBytes] = useState(0);
  const [bufferLimitGb, setBufferLimitGb] = useState(4);
  const [vaultLimitGb, setVaultLimitGb] = useState(32);
  const [downloadProgress, setDownloadProgress] = useState({});
  const [ledger, setLedger] = useState([]);
  const [activeTab, setActiveTab] = useState('buffer'); // buffer | books | ledger
  const [ledgerStats, setLedgerStats] = useState({});

  useEffect(() => {
    loadBufferInfo();
    loadLedger();

    const unsubProgress = OfflineBufferService.on('download_progress', ({ trackId, progress }) => {
      setDownloadProgress(prev => ({ ...prev, [trackId]: progress }));
    });
    const unsubComplete = OfflineBufferService.on('download_complete', () => {
      loadBufferInfo();
      setDownloadProgress(prev => {
        const next = { ...prev };
        delete next[Object.keys(downloadProgress)[0]];
        return next;
      });
    });
    const unsubDeleted = OfflineBufferService.on('buffer_deleted', () => loadBufferInfo());

    return () => { unsubProgress(); unsubComplete(); unsubDeleted(); };
  }, []);

  const loadBufferInfo = async () => {
    const meta = OfflineBufferService.meta || {};
    setBufferedTracks(meta);
    
    const [transSize, persSize] = await Promise.all([
      OfflineBufferService.getTransientSize(),
      OfflineBufferService.getPersistentSize()
    ]);
    setTransientSizeBytes(transSize);
    setPersistentSizeBytes(persSize);

    const [bufLimit, vaultLimit] = await Promise.all([
      AsyncStorage.getItem('@omega_buffer_limit'),
      AsyncStorage.getItem('@omega_vault_limit')
    ]);
    if (bufLimit) setBufferLimitGb(parseInt(bufLimit, 10));
    if (vaultLimit) setVaultLimitGb(parseInt(vaultLimit, 10));

    // Aggregate books
    const booksMap = {};
    Object.entries(meta).forEach(([trackId, info]) => {
      if (info.albumData && info.albumData.albumId) {
        const aId = info.albumData.albumId;
        if (!booksMap[aId]) {
          booksMap[aId] = {
            ...info.albumData,
            downloadedTracks: 0,
            totalSize: 0,
            trackIds: []
          };
        }
        booksMap[aId].downloadedTracks += 1;
        booksMap[aId].totalSize += (info.size || 0);
        booksMap[aId].trackIds.push(trackId);
      }
    });
    setOfflineBooks(Object.values(booksMap));
  };

  const loadLedger = () => {
    const sessions = StateLedgerService.getLedger();
    setLedger([...sessions].reverse().slice(0, 50));
    setLedgerStats(StateLedgerService.getLedgerStats());
  };

  const handleDelete = (trackId) => {
    Alert.alert(
      'Remove Buffer',
      'Delete this locally buffered file?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => OfflineBufferService.deleteBuffer(trackId) }
      ]
    );
  };

  const handleDeleteBook = (albumId, trackIds) => {
    Alert.alert(
      'Remove Book',
      `Delete all ${trackIds.length} locally buffered files for this book?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            for (const trackId of trackIds) {
              await OfflineBufferService.deleteBuffer(trackId);
            }
          }
        }
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Buffers',
      `Delete all ${Object.keys(bufferedTracks).length} buffered files (${formatBytes(bufferSizeBytes)})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: () => OfflineBufferService.clearAllBuffers() }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabs}>
        {[['buffer', 'OFFLINE BUFFER'], ['books', 'OFFLINE BOOKS'], ['ledger', 'SESSION LEDGER']].map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, activeTab === key && styles.tabActive]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>

        {activeTab === 'buffer' && (
          <>
            {/* Buffer stats */}
            <View style={styles.statsCard}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{Object.keys(bufferedTracks).filter(k => !bufferedTracks[k].isPersistent).length}</Text>
                <Text style={styles.statLabel}>Streaming Tracks</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{Math.round(transientSizeBytes / 1024 / 1024)}MB</Text>
                <Text style={styles.statLabel}>Active Cache</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{bufferLimitGb}GB</Text>
                <Text style={styles.statLabel}>Limit</Text>
              </View>
            </View>

            {/* Active downloads */}
            {Object.entries(downloadProgress).map(([trackId, progress]) => (
              <View key={trackId} style={styles.downloadCard}>
                <Text style={styles.downloadLabel}>Downloading...</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                </View>
                <Text style={styles.downloadPercent}>{Math.round(progress * 100)}%</Text>
              </View>
            ))}

            {/* Buffered tracks */}
            {Object.entries(bufferedTracks).length > 0 ? (
              <>
                <Text style={{ fontFamily: 'Courier New', fontSize: 10, color: colors.goldDim, marginBottom: 8 }}>
                  TRANSIENT CACHE ({Object.keys(bufferedTracks).filter(k => !bufferedTracks[k].isPersistent).length})
                </Text>
                <View style={styles.card}>
                  {Object.entries(bufferedTracks)
                    .filter(([trackId, info]) => !info.isPersistent)
                    .sort((a, b) => b[1].downloadedAt - a[1].downloadedAt)
                    .map(([trackId, info]) => (
                    <BufferedTrackRow
                      key={trackId}
                      trackId={trackId}
                      info={info}
                      onDelete={handleDelete}
                    />
                  ))}
                </View>
                <TouchableOpacity style={styles.clearAllBtn} onPress={handleClearAll}>
                  <Text style={styles.clearAllText}>Clear All Buffers</Text>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>⬡</Text>
                <Text style={styles.emptyTitle}>No Buffered Files</Text>
                <Text style={styles.emptySub}>Files buffer automatically when you play them online</Text>
              </View>
            )}
          </>
        )}

        {activeTab === 'books' && (
          <>
            <View style={styles.statsCard}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{offlineBooks.length}</Text>
                <Text style={styles.statLabel}>Vaulted Books</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{Math.round(persistentSizeBytes / 1024 / 1024)}MB</Text>
                <Text style={styles.statLabel}>Vault Used</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{vaultLimitGb}GB</Text>
                <Text style={styles.statLabel}>Limit</Text>
              </View>
            </View>

            <Text style={{ fontFamily: 'Courier New', fontSize: 10, color: colors.goldDim, marginBottom: 8 }}>
              PERMANENT VAULT
            </Text>

            {offlineBooks.length > 0 ? (
              <View style={styles.booksWrap}>
                {offlineBooks.map(book => (
                  <OfflineBookCard
                    key={book.albumId}
                    book={book}
                    onDelete={handleDeleteBook}
                  />
                ))}
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>📚</Text>
                <Text style={styles.emptyTitle}>No Offline Books</Text>
                <Text style={styles.emptySub}>Download entire books from the Album view to pin them here.</Text>
              </View>
            )}
          </>
        )}

        {activeTab === 'ledger' && (
          <>
            {/* Ledger stats */}
            <View style={styles.statsCard}>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{ledgerStats.sessions || 0}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{ledgerStats.totalListenedHours || 0}h</Text>
                <Text style={styles.statLabel}>Listened</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statNum}>{ledgerStats.uniqueTracks || 0}</Text>
                <Text style={styles.statLabel}>Titles</Text>
              </View>
            </View>

            {ledger.length > 0 ? (
              <View style={styles.card}>
                {ledger.map((session, i) => (
                  <LedgerRow key={i} session={session} />
                ))}
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>◈</Text>
                <Text style={styles.emptyTitle}>No Sessions Yet</Text>
                <Text style={styles.emptySub}>Sessions are VERITAS-sealed as you listen</Text>
              </View>
            )}
          </>
        )}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.obsidian },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, padding: spacing.md, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.gold },
  tabText: { fontFamily: 'Courier New', fontSize: 9, color: colors.textDim, letterSpacing: 1, textAlign: 'center' },
  tabTextActive: { color: colors.gold },

  content: { flex: 1 },
  contentInner: { padding: spacing.lg, gap: spacing.md },

  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.obsidianMid,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { fontFamily: 'Courier New', fontSize: 20, color: colors.gold, fontWeight: 'bold' },
  statLabel: { fontFamily: 'Courier New', fontSize: 8, color: colors.textDim, letterSpacing: 1, marginTop: 2 },

  downloadCard: {
    backgroundColor: colors.obsidianMid,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  downloadLabel: { fontFamily: 'Courier New', fontSize: 10, color: colors.gold },
  progressBar: { height: 4, backgroundColor: colors.obsidianLight, borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: colors.gold, borderRadius: 2 },
  downloadPercent: { fontFamily: 'Courier New', fontSize: 9, color: colors.textDim, textAlign: 'right' },

  card: {
    backgroundColor: colors.obsidianMid,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  trackRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md },
  trackInfo: { flex: 1 },
  trackId: { fontFamily: 'Courier New', fontSize: 10, color: colors.text },
  trackMeta: { fontFamily: 'Courier New', fontSize: 8, color: colors.textDim, marginTop: 2 },
  deleteBtn: { padding: spacing.sm },
  deleteBtnText: { color: colors.red, fontSize: 14 },

  booksWrap: { gap: spacing.md },
  bookCard: {
    flexDirection: 'row',
    backgroundColor: colors.obsidianMid,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.md,
  },
  bookCover: { width: 50, height: 50, borderRadius: radius.sm },
  bookCoverPlaceholder: { width: 50, height: 50, borderRadius: radius.sm, backgroundColor: colors.obsidianLight, alignItems: 'center', justifyContent: 'center' },
  bookCoverText: { color: colors.goldDim, fontSize: 24, transform: [{ scaleY: 1.2 }] },
  bookCardInfo: { flex: 1 },
  bookCardTitle: { fontFamily: 'Courier New', fontSize: 12, color: colors.text, fontWeight: 'bold' },
  bookCardArtist: { fontFamily: 'Courier New', fontSize: 10, color: colors.goldDim, marginTop: 2 },
  bookCardMeta: { fontFamily: 'Courier New', fontSize: 9, color: colors.textDim, marginTop: 4 },

  clearAllBtn: {
    borderWidth: 1, borderColor: colors.red,
    borderRadius: radius.md, padding: spacing.md,
    alignItems: 'center',
  },
  clearAllText: { fontFamily: 'Courier New', fontSize: 11, color: colors.red, letterSpacing: 1 },

  ledgerRow: { flexDirection: 'row', alignItems: 'flex-start', padding: spacing.md, gap: spacing.md },
  sealIndicator: { width: 3, height: '100%', minHeight: 40, backgroundColor: colors.gold, borderRadius: 2 },
  ledgerInfo: { flex: 1 },
  ledgerTitle: { fontFamily: 'Courier New', fontSize: 11, color: colors.text },
  ledgerMeta: { fontFamily: 'Courier New', fontSize: 9, color: colors.textDim, marginTop: 2 },
  ledgerSeal: { fontFamily: 'Courier New', fontSize: 8, color: colors.goldDim, marginTop: 2 },

  empty: { alignItems: 'center', padding: spacing.xxl },
  emptyIcon: { fontSize: 40, color: colors.goldDim, marginBottom: spacing.lg },
  emptyTitle: { fontFamily: 'Courier New', fontSize: 13, color: colors.text, letterSpacing: 2, marginBottom: spacing.sm },
  emptySub: { fontFamily: 'Courier New', fontSize: 10, color: colors.textDim, textAlign: 'center' },
});
