# Ω Sovereign Audio
**High-Assurance Secure Offline Audio Platform**

> A remote telemetry-linked local audiobook and YouTube hybrid media player running a bifurcated transient-buffer/permanent-vault storage engine. Built symmetrically for Android via React Native and desktop via the VERITAS ecosystem.

---

## Architecture Overview

Sovereign Audio replaces cloud-based podcast platforms by hosting a self-contained local library synced over `aiohttp` to an active mobile front-end. It emphasizes memory isolation, fault tolerance through severe network conditions, and extreme privacy. 

### Core Differentiators
1. **Dual-Tier Storage Isolation (`OfflineBufferService.js`)**
   - **Transient Buffer**: Self-evicting 4GB cyclic cache for active network streams.
   - **Persistent Vault**: Protected 32GB offline ledger immune to cleanup daemons.
2. **Robust Telemetry (`MediaSyncService.js`)**
   - Complete AbortController implementation for proxy failure (LocalTunnel/Ngrok).
   - Exponential 3-ping backoffs and flexible heartbeat bounds.
3. **VERITAS Gold/Black Theme Standard**
   - Implements `veritas.js` theme tokens across the UX.
   - Live network states and active hardware-level playhead telemetry.

## Running Locally

1. **Start the Sync Daemon** (Desktop Host)
   ```bash
   cd backend
   python media_sync_daemon.py
   ```
   > The backend runs an `aiohttp` server on port `5002` handling Range requests and telemetry JSON mapping.

2. **Launch Android Environment** (Mobile Client)
   ```bash
   npx react-native run-android
   ```
   > *Note: Modify `MediaSyncService.js` to target your local machine IP or tunneling proxy URL.*

## VERITAS Framework Certification

Status: `AUDIT-READY / GAP-CLOSED / NATIVE COMPILATION BOUNDS SECURED`

## License
MIT License. See [LICENSE](LICENSE) for more details. Copyright (c) 2026 VERITAS Omega & RJ Lopez AI.

---
*Built with Gravity Omega. "We do not determine what is true. We determine what survives."*
