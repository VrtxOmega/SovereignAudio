import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Switch } from 'react-native';
import { colors, spacing, radius, typography } from '../theme/veritas';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MediaSyncService from '../services/MediaSyncService';

const CONN_KEY = '@omega_host_ip';
const BUFFER_KEY = '@omega_buffer_limit';
const VAULT_KEY = '@omega_vault_limit';
const BLE_KEY = '@omega_ble_enabled';
const A2DP_KEY = '@omega_a2dp_force';
const VERBOSE_KEY = '@omega_verbose_logs';

export default function SettingsScreen() {
  const [ip, setIp] = useState('');
  const [savedIp, setSavedIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [btEnabled, setBtEnabled] = useState(true);
  const [a2dpEnabled, setA2dpEnabled] = useState(false);
  const [sysLogEnabled, setSysLogEnabled] = useState(false);
  const [bufferLimit, setBufferLimit] = useState(4); // GB
  const [vaultLimit, setVaultLimit] = useState(32); // GB

  useEffect(() => {
    const loadSettings = async () => {
      const [val, buf, vault, ble, a2dp, vLog] = await Promise.all([
        AsyncStorage.getItem(CONN_KEY),
        AsyncStorage.getItem(BUFFER_KEY),
        AsyncStorage.getItem(VAULT_KEY),
        AsyncStorage.getItem(BLE_KEY),
        AsyncStorage.getItem(A2DP_KEY),
        AsyncStorage.getItem(VERBOSE_KEY)
      ]);
      if (val) { setIp(val); setSavedIp(val); }
      if (buf) setBufferLimit(parseInt(buf, 10));
      if (vault) setVaultLimit(parseInt(vault, 10));
      if (ble !== null) setBtEnabled(ble === 'true');
      if (a2dp !== null) setA2dpEnabled(a2dp === 'true');
      if (vLog !== null) setSysLogEnabled(vLog === 'true');
    };
    loadSettings();
  }, []);

  const handleToggle = async (key, val, setter) => {
    setter(val);
    await AsyncStorage.setItem(key, String(val));
    if (key === VERBOSE_KEY) MediaSyncService.setVerboseLogs?.(val);
  };

  const handleBufferLimitCycle = async () => {
    const options = [2, 4, 8, 16];
    const nextIdx = (options.indexOf(bufferLimit) + 1) % options.length;
    const nextVal = options[nextIdx];
    setBufferLimit(nextVal);
    await AsyncStorage.setItem(BUFFER_KEY, String(nextVal));
  };

  const handleVaultLimitCycle = async () => {
    const options = [16, 32, 64, 128];
    const nextIdx = (options.indexOf(vaultLimit) + 1) % options.length;
    const nextVal = options[nextIdx];
    setVaultLimit(nextVal);
    await AsyncStorage.setItem(VAULT_KEY, String(nextVal));
  };

  const handleUpdate = async () => {
    if (!ip.trim()) return;
    setLoading(true);
    await MediaSyncService.init(ip.trim());
    setSavedIp(ip.trim());
    setTimeout(() => setLoading(false), 800);
  };

  const handlePurge = async () => {
    await AsyncStorage.removeItem(CONN_KEY);
    setIp('');
    setSavedIp('');
    MediaSyncService.ws?.close();
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>SYSTEM CONF</Text>
          <Text style={styles.headerSub}>Sovereign Audio Local Orchestration</Text>
        </View>

        {/* Section 1: Network & Tunnels */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>☁ CLOUD RELAY ARCHITECTURE</Text>
          <Text style={styles.label}>TELEMETRY HOST URL OR IP ADDRESS</Text>
          <TextInput
            style={styles.input}
            value={ip}
            onChangeText={setIp}
            placeholder="omega-audio-rlopez.loca.lt"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity 
            style={[styles.btn, (!ip || loading) && styles.btnDisabled]} 
            onPress={handleUpdate}
            disabled={!ip || loading}
          >
            <Text style={styles.btnText}>
              {loading ? 'SECURING SOCKET...' : 'ENFORCE NEW ROUTE'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Section 2: Hardware & Buffer */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>🎧 HARDWARE & STORAGE</Text>
          
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>High-Fidelity BLE Broadcast</Text>
              <Text style={styles.toggleSub}>Push full track metadata to dash/smartwatch</Text>
            </View>
            <Switch
              value={btEnabled}
              onValueChange={(val) => handleToggle(BLE_KEY, val, setBtEnabled)}
              trackColor={{ false: colors.obsidian, true: colors.goldDim }}
              thumbColor={btEnabled ? colors.gold : colors.textDim}
            />
          </View>
          
          <View style={styles.separator} />

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>Force A2DP Audio Sink</Text>
              <Text style={styles.toggleSub}>Lock output to connected Bluetooth device</Text>
            </View>
            <Switch
              value={a2dpEnabled}
              onValueChange={(val) => handleToggle(A2DP_KEY, val, setA2dpEnabled)}
              trackColor={{ false: colors.obsidian, true: colors.goldDim }}
              thumbColor={a2dpEnabled ? colors.gold : colors.textDim}
            />
          </View>

          <View style={styles.separator} />

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>Temp Buffer Limit</Text>
              <Text style={styles.toggleSub}>Max storage for streaming tracks</Text>
            </View>
            <TouchableOpacity style={styles.limitBtn} onPress={handleBufferLimitCycle}>
              <Text style={styles.limitBtnText}>{bufferLimit} GB</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.separator} />

          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>Offline Book Vault Limit</Text>
              <Text style={styles.toggleSub}>Max storage for permanent downloads</Text>
            </View>
            <TouchableOpacity style={styles.limitBtn} onPress={handleVaultLimitCycle}>
              <Text style={styles.limitBtnText}>{vaultLimit} GB</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 3: Diagnostic Data */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>📊 DIAGNOSTICS & LOGGING</Text>
          
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.toggleTitle}>Verbose Telemetry Logs</Text>
              <Text style={styles.toggleSub}>Show handshake trace / heartbeat ping latency</Text>
            </View>
            <Switch
              value={sysLogEnabled}
              onValueChange={(val) => handleToggle(VERBOSE_KEY, val, setSysLogEnabled)}
              trackColor={{ false: colors.obsidian, true: colors.goldDim }}
              thumbColor={sysLogEnabled ? colors.gold : colors.textDim}
            />
          </View>
        </View>

        {/* Section 4: Deep Storage Purge */}
        <View style={[styles.card, { borderColor: colors.red + '44' }]}>
          <Text style={[styles.sectionHeader, { color: colors.red }]}>⚠ LOCAL STATE DANGER ZONE</Text>
          <Text style={styles.label}>PURGE ALL CACHE AND AUTH TOKENS</Text>
          <TouchableOpacity style={styles.purgeBtn} onPress={handlePurge}>
            <Text style={styles.purgeBtnText}>FLUSH STORAGE CONFIG</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.obsidian },
  scroll: { padding: spacing.xl, paddingBottom: 100 },

  header: { alignItems: 'center', marginBottom: spacing.xl, marginTop: spacing.md },
  headerTitle: { ...typography.title, fontSize: 24, letterSpacing: 4 },
  headerSub: { fontFamily: 'Courier New', fontSize: 10, color: colors.goldDim, marginTop: spacing.xs, letterSpacing: 1 },

  card: {
    backgroundColor: colors.obsidianMid,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    fontFamily: 'Courier New',
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.gold,
    letterSpacing: 2,
    marginBottom: spacing.md,
  },

  label: { fontFamily: 'Courier New', fontSize: 10, color: colors.textDim, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.obsidianDark,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, borderRadius: radius.md,
    color: colors.gold, fontFamily: 'Courier New',
    marginBottom: spacing.lg,
  },

  btn: {
    backgroundColor: colors.gold, padding: spacing.md,
    borderRadius: radius.md, alignItems: 'center',
    shadowColor: colors.gold, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 10,
  },
  btnDisabled: { backgroundColor: colors.obsidian, borderColor: colors.border, borderWidth: 1, shadowOpacity: 0 },
  btnText: { color: colors.obsidianDark, fontFamily: 'Courier New', fontWeight: 'bold', letterSpacing: 2 },

  purgeBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1, borderColor: colors.red,
    padding: spacing.md, borderRadius: radius.md,
    alignItems: 'center', marginTop: spacing.xs,
  },
  purgeBtnText: { color: colors.red, fontFamily: 'Courier New', fontWeight: 'bold', letterSpacing: 2 },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  toggleTitle: { fontFamily: 'Courier New', fontSize: 13, color: colors.text, marginBottom: 2 },
  toggleSub: { fontFamily: 'Courier New', fontSize: 9, color: colors.textDim },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },

  limitBtn: {
    backgroundColor: colors.obsidianDark,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  limitBtnText: { fontFamily: 'Courier New', fontSize: 13, color: colors.gold, fontWeight: 'bold' }
});
