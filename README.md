<div align="center">
  <h1>SOVEREIGN MEDIA MOBILE</h1>
  <p><strong>Android Companion for Sovereign Media</strong></p>
  <p><em>Your library. Your pocket. Your sovereignty.</em></p>
</div>

![Status](https://img.shields.io/badge/Status-ACTIVE-success?style=for-the-badge&labelColor=000000&color=d4af37)
![Platform](https://img.shields.io/badge/Platform-Android-brightgreen?style=for-the-badge&labelColor=000000)
![Stack](https://img.shields.io/badge/Stack-React%20Native-informational?style=for-the-badge&labelColor=000000)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge&labelColor=000000)

---

The Android companion to [Sovereign Media](https://github.com/VrtxOmega/SovereignMedia). High-assurance secure offline media platform running a bifurcated transient-buffer/permanent-vault storage engine. Sync your audiobook and media library from desktop to phone — zero cloud, zero subscriptions.

> **Offline-first. Sync over local network. No streaming service required.**

## Architecture

`
+---------------------------+          +---------------------------+
|  SOVEREIGN MEDIA MOBILE   |  <-WS->  |  SOVEREIGN MEDIA (PC)     |
|  React Native (Android)   |          |  Electron Desktop App     |
+---------------------------+          +---------------------------+
|  Local Storage Engine     |          |  Media Library + Index    |
|  Transient Buffer         |          |  Cover Art Pipeline       |
|  Permanent Vault          |          |  Position Sync            |
+---------------------------+          +---------------------------+
`

| Component | Purpose |
|-----------|---------|
| **React Native Shell** | Native Android UI with VERITAS aesthetics |
| **Storage Engine** | Bifurcated transient-buffer + permanent-vault for media files |
| **Sync Bridge** | WebSocket connection to desktop for library synchronization |
| **Offline Playback** | Full media playback without network connectivity |
| **Position Sync** | Cross-device position persistence for audiobooks |

## Features

- **Offline-First Playback** - All media stored locally on device, no streaming
- **Library Sync** - One-click sync from desktop Sovereign Media instance
- **Cover Art Pipeline** - ADB-based cover injection for 2000+ assets
- **Position Persistence** - Resume playback across phone and desktop
- **Bifurcated Storage** - Transient buffer for incoming, permanent vault for committed media
- **VERITAS Aesthetic** - Gold-and-obsidian interface consistent with desktop

## Quick Start

### Requirements
- Android device
- React Native development environment
- Desktop Sovereign Media instance

### Install

`ash
npm install

# Deploy to connected Android device
npx react-native run-android
`

### Sync Library

1. Ensure desktop Sovereign Media is running
2. Open the mobile app
3. Navigate to Sync settings
4. Connect to your desktop's local IP

## License

MIT

---

<div align="center">
  <sub>Built by <a href="https://github.com/VrtxOmega">RJ Lopez</a> | VERITAS Framework</sub>
</div>