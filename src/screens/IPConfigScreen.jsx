import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MediaSyncService from '../services/MediaSyncService';
import { colors, spacing } from '../theme/veritas';

export default function IPConfigScreen({ navigation }) {
  const [ip, setIp] = useState('');

  const handleConnect = async () => {
    if (!ip.trim()) return;
    
    // Attempt init via MediaSyncService, which also saves it to AsyncStorage
    await MediaSyncService.init(ip.trim());
    
    // Navigate strictly to Main Tabs
    navigation.replace('Main');
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>
        <Text style={styles.title}>SOVEREIGN AUDIO</Text>
        <Text style={styles.subtitle}>NODE UNAUTHENTICATED</Text>
        
        <Text style={styles.label}>ENTER DESKTOP IP ADDRESS</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. omega-audio.loca.lt"
          placeholderTextColor={colors.goldDim}
          value={ip}
          onChangeText={setIp}
          keyboardType="default"
          autoCapitalize="none"
          autoCorrect={false}
        />
        
        <TouchableOpacity style={styles.button} onPress={handleConnect}>
          <Text style={styles.buttonText}>ESTABLISH LINK</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.obsidian,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.obsidianLight,
    padding: spacing.lg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Courier New',
    fontSize: 20,
    color: colors.gold,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: 'Courier New',
    fontSize: 10,
    color: colors.red,
    letterSpacing: 1,
    marginBottom: spacing.xl,
  },
  label: {
    fontFamily: 'Courier New',
    fontSize: 12,
    color: colors.text,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  input: {
    width: '100%',
    backgroundColor: colors.obsidian,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    padding: spacing.md,
    fontFamily: 'Courier New',
    fontSize: 16,
    borderRadius: 4,
    marginBottom: spacing.lg,
  },
  button: {
    backgroundColor: colors.gold,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 4,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: colors.obsidian,
    fontFamily: 'Courier New',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  }
});
