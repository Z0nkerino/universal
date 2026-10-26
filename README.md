# Universal Planner

**Your calendar, tasks, notes, ideas and health — in one calm place.**
A product of **Eternal Inc.**

Private by design: everything lives on your device (IndexedDB). No accounts, no server, no tracking. Works fully offline, in English and Russian, on Mac, Windows, Android, iPhone, iPad and in any modern browser.

## Get the app

Every release is on the [Releases page](https://github.com/Z0nkerino/universal/releases/latest).

| Platform | Download | Updates |
| --- | --- | --- |
| **Mac** | `Universal-Planner-<version>-mac.dmg` (Apple Silicon + Intel) | Automatic, in the background |
| **Windows** | `Universal-Planner-<version>-windows-setup.exe` | Automatic, in the background |
| **Android** | `Universal-Planner-<version>-android.apk` | The app offers each new APK |
| **iPhone / iPad** | Open the web app in Safari → Share → **Add to Home Screen** | Automatic |
| **Any browser** | The web app at `https://z0nkerino.github.io/universal/` | Automatic |

**Mac, first launch:** the app isn't notarized yet (that needs a paid Apple Developer account), so macOS blocks it the first time. Open **System Settings → Privacy & Security** and click **Open Anyway**. After that it opens normally.

**Windows, first launch:** SmartScreen may say "Windows protected your PC" because the installer isn't code-signed yet. Click **More info → Run anyway**.

**Android:** open the `.apk` on your phone and allow your browser to install apps when asked.

**iPhone:** a native App Store app needs a paid Apple Developer account. The web app installed from Safari works offline, has its own icon and keeps your data on the device.

## Develop

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # production web build in dist/
npm run preview    # serves dist/ at http://localhost:4173 (service worker + offline)
```

Desktop and Android builds:

```bash
npm run desktop     # build and run the desktop app locally
npm run dist:mac    # on a Mac: release/Universal-Planner-<version>-mac.dmg
npm run dist:win    # on Windows: release/Universal-Planner-<version>-windows-setup.exe
npm run android     # build the web app into the Android project (then open android/ in Android Studio)
```

## Releasing

```bash
npm version minor --no-git-tag-version   # e.g. 1.0.0 → 1.1.0
git commit -am "Release 1.1.0" && git push
```

When a push to `main` (or the working branch) carries a version with no release yet, the **Apps** GitHub workflow builds the Mac `.dmg`, the Windows installer, the Android `.apk` and the desktop update bundle. It publishes them as a GitHub Release and deploys the web app to the `gh-pages` branch.

### One-time setup

- **Web app hosting:** in the repository's **Settings → Pages**, set the source to **Deploy from a branch → `gh-pages` / root**.
- **Android signing key:** add two repository secrets under **Settings → Secrets and variables → Actions**:
  - `ANDROID_KEYSTORE`: the keystore file, base64-encoded
  - `ANDROID_KEYSTORE_PASSWORD`: its password

  Create the key once with:

  ```bash
  keytool -genkeypair -keystore up.keystore -alias universal-planner -keyalg RSA -keysize 2048 -validity 36500
  base64 -w0 up.keystore   # paste the output into ANDROID_KEYSTORE
  ```

  Keep the keystore safe and never commit it. Android only installs an update if it's signed with the same key. Without the secrets, CI signs each APK with a throwaway key, and you'd have to uninstall before installing a newer version.

### How updates work

- **Desktop:** apps check the latest release when they open and every 4 hours. They download the new content in the background, verify its SHA-256 checksum, then offer **Restart**. If a new version fails to start, the app rolls back by itself. If a release changes the Electron shell (`updates.shellVersion` in `package.json`), apps offer the new installer instead.
- **Android:** the app reads the same `latest.json` feed and offers the new APK.
- **Web / iPhone:** the service worker picks up the new version on the next launch.

Release files must be downloadable without signing in, so the repository has to be public.

## Using it

| Shortcut | Action |
| --- | --- |
| ⌘K / Ctrl K, or `/` | Command bar: search everything, or type "new task tomorrow 5pm gym" |
| Alt N | Capture an idea from anywhere |
| ⌥1 … ⌥7 / Alt 1 … Alt 7 | Today · Calendar · Notes · Ideas · Health · Insights · Afina |
| ⌘, / Ctrl , | Settings |

**Afina** works on every device with her built-in engine: planning your day, logging food, water, sleep and mood, creating tasks and events, breaking work into steps, and answering questions about your data in English or Russian. For free-form chat, install the on-device model from the Afina screen. It's a one-time download that runs offline and needs WebGPU (Chrome or Edge 113+, Safari 18+, or the desktop app).

**Your data:** Settings → Your data exports a full backup (`.json`) and imports it on another device. Sample data from onboarding can be removed there with one click.

## Project layout

```
src/
  app/            shell, router, sidebar, tab bar, command bar, quick capture
  ui/             shared components (Glass, TiltCard, Button, Sheet, charts, drag and drop…)
  lib/            db (Dexie), actions, natural-language parsing, settings, i18n (EN/RU), backup
  features/
    today/  calendar/  planner/  notes/  ideas/  diet/  analytics/  afina/  onboarding/  settings/
electron/         desktop shell and self-updater
android/          Capacitor Android project
public/brand/     logos and app icons
```

---

© Eternal Inc. All rights reserved.
