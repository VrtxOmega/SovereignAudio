import React, { useEffect, useState } from 'react';
import { View, Text, StatusBar, StyleSheet, AppState, ActivityIndicator } from 'react-native';
import { NavigationContainer as NavContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors, spacing } from './src/theme/veritas';
import { setupPlayer } from './src/services/PlayerService';
import MediaSyncService from './src/services/MediaSyncService';
import OfflineBufferService from './src/services/OfflineBufferService';
import StateLedgerService from './src/services/StateLedgerService';

import LibraryScreen from './src/screens/LibraryScreen';
import NowPlayingScreen from './src/screens/NowPlayingScreen';
import DownloadsScreen from './src/screens/DownloadsScreen';
import IPConfigScreen from './src/screens/IPConfigScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AlbumScreen from './src/screens/AlbumScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const TabIcon = ({ label, focused }) => {
  const icons = { Library: '⊟', Downloads: '⬡' };
  return (
    <View style={tabStyles.wrapper}>
      <Text style={[tabStyles.icon, { color: focused ? colors.gold : colors.goldDim }]}>
        {icons[label] || '●'}
      </Text>
      <Text style={[tabStyles.label, { color: focused ? colors.gold : colors.goldDim }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
};

const tabStyles = StyleSheet.create({
  wrapper: { alignItems: 'center' },
  icon: { fontSize: 18 },
  label: { fontFamily: 'Courier New', fontSize: 7, letterSpacing: 1, marginTop: 2 },
});

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.obsidianLight,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTintColor: colors.gold,
        headerTitleStyle: { fontFamily: 'Courier New', fontSize: 11, letterSpacing: 3 },
        tabBarStyle: {
          backgroundColor: colors.obsidianLight,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          height: 72,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="Library"
        component={LibraryScreen}
        options={{
          title: 'Ω SOVEREIGN AUDIO',
          tabBarIcon: ({ focused }) => <TabIcon label="Library" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Downloads"
        component={DownloadsScreen}
        options={{
          title: 'OFFLINE BUFFER',
          tabBarIcon: ({ focused }) => <TabIcon label="Downloads" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'SYSTEM CONF',
          tabBarIcon: ({ focused }) => <Text style={{ color: focused ? colors.gold : colors.goldDim, fontSize: 18 }}>⚙</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        await setupPlayer();
        await OfflineBufferService.init();
        await StateLedgerService.init();

        const host = await AsyncStorage.getItem('omega_media_host');
        if (host) {
          await MediaSyncService.init(host);
          setInitialRoute('Main');
        } else {
          setInitialRoute('IPConfig');
        }
        console.log('[APP] Sovereign Audio initialized');
      } catch (err) {
        console.error('[APP] Initialization failed:', err);
        setInitialRoute('IPConfig');
      }
    };

    init();

    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background' || state === 'inactive') {
        try {
          const { getPosition } = await import('./src/services/PlayerService');
          const pos = await getPosition();
          StateLedgerService.updatePosition(Math.round(pos * 1000), true);
        } catch (e) {
           console.log("Error pushing position on background", e);
        }
      }
    });

    return () => {
      sub.remove();
      StateLedgerService.destroy();
      MediaSyncService.destroy();
    };
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.obsidian, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.obsidian} />
        <NavContainer
          theme={{
            dark: true,
            colors: {
              primary: colors.gold,
              background: colors.obsidian,
              card: colors.obsidianLight,
              text: colors.text,
              border: colors.border,
              notification: colors.red,
            }
          }}
        >
          <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
            <Stack.Screen name="IPConfig" component={IPConfigScreen} />
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="Album" component={AlbumScreen} />
            <Stack.Screen
              name="NowPlaying"
              component={NowPlayingScreen}
              options={{
                headerShown: false,
                presentation: 'modal',
                gestureEnabled: true,
              }}
            />
          </Stack.Navigator>
        </NavContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
