<div align="center">
  <img src="https://raw.githubusercontent.com/VrtxOmega/Gravity-Omega/master/omega_icon.png" width="100" alt="SOVEREIGN MEDIA MOBILE" />
  <h1>SOVEREIGN MEDIA MOBILE</h1>
  <p><strong>Android Companion for Sovereign Media — React Native Offline Media Vault</strong></p>
</div>

<div align="center">

![Status](https://img.shields.io/badge/Status-ARCHIVED-8B0000?style=for-the-badge&labelColor=000000&color=d4af37)
![Version](https://img.shields.io/badge/Version-v1.0.0--FINAL-informational?style=for-the-badge&labelColor=000000)
![Platform](https://img.shields.io/badge/Platform-Android-brightgreen?style=for-the-badge&labelColor=000000)
![Stack](https://img.shields.io/badge/Stack-React%20Native-informational?style=for-the-badge&labelColor=000000)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge&labelColor=000000)

</div>

---

> **NOTICE: SovereignMediaMobile has been merged into [SovereignMedia](https://github.com/VrtxOmega/SovereignMedia/tree/main/mobile) as the official mobile companion.**
> This repository is archived. Future development continues in the parent SovereignMedia repo under the `mobile/` directory.

---

## Ecosystem Canon

Sovereign Media Mobile was the Android extension of the VERITAS & Sovereign Ecosystem's media management layer — a React Native client that sync'd audiobook and video libraries from the desktop Sovereign Media Electron app via a local WebSocket bridge. It ran a bifurcated storage engine (transient buffer + permanent vault) and was designed for zero-cloud, zero-subscription offline media consumption. The mobile extension has been absorbed into the parent project to unify the deployment surface.

---

## What It Was

An Android media player providing:

- Audiobook and eBook library synced from desktop Sovereign Media
- Local-only storage — no cloud dependency
- WebSocket-based sync over local network
- Playback position persistence
- Offline-first architecture with encrypted persistent vault

---

## Migration Path

The full source code and build configuration are now maintained as a `mobile/` subdirectory in [SovereignMedia](https://github.com/VrtxOmega/SovereignMedia/tree/main/mobile).

```bash
git clone https://github.com/VrtxOmega/SovereignMedia.git
cd SovereignMedia/mobile
# See README.md in that directory for build instructions
```

---

## History

- v1.0.0 — Initial Android companion with sync bridge
- v1.1.0-ARCHIVED — Merged into SovereignMedia `mobile/` subdirectory

---

## License

Released under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Archived and maintained by <a href="https://github.com/VrtxOmega">RJ Lopez</a> &nbsp;|&nbsp; VERITAS &amp; Sovereign Ecosystem &mdash; Omega Universe</sub>
</div>
