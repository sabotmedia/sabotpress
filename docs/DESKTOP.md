# SabotPress Desktop

SabotPress Desktop packages the same publishing interface as a normal installable application for Windows, macOS and Linux.

The desktop runtime keeps publication data on the user's own computer:

- SQLite database in the operating system's SabotPress application-data folder
- media files in a local media directory
- no hosting account required for local use
- no domain required for local use

The Electron shell starts a localhost-only SabotPress server. Existing API functions run against a small D1-compatible SQLite adapter and an R2-compatible filesystem adapter so the normal newsroom can keep using the same application code.

## Local data

The application binds only to `127.0.0.1` and chooses an available local port at startup.

Desktop data belongs in Electron's `userData` directory rather than inside the installed application. Reinstalling/upgrading the program should therefore not remove publication data.

The desktop menu includes **Open publication data folder** so a user can find the SQLite file and media directory without learning OS-specific hidden-folder paths.

## Build locally

```bash
npm install
npm run desktop
```

Create an unpacked test build:

```bash
npm run desktop:pack
```

Create installers for the current operating system:

```bash
npm run desktop:dist
```

Platform-specific scripts are also available:

```bash
npm run desktop:dist:win
npm run desktop:dist:mac
npm run desktop:dist:linux
```

## Installer formats

The current builder configuration targets:

- Windows: NSIS installer and portable executable
- macOS: DMG and ZIP
- Linux: AppImage and Debian package

Unsigned development builds may trigger normal operating-system warnings. Public releases should eventually use Windows code signing and Apple Developer ID signing/notarization when the project has the resources to maintain those credentials.

## Publish Online

Desktop is not a dead-end local editor. The **Publish** menu opens the Publish Online guidance and domain setup.

See `docs/PUBLISH_ONLINE.md` for the $0-hosting-first policy and current supported deployment route.
