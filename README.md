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

**iPhone:** the native app (with Home and Lock Screen widgets, a Live Activity and the Dynamic Island) is built from `ios/` in Xcode. See [iOS app](#ios-app-widgets-and-live-activity) below. Distributing it needs a paid Apple Developer account. Until then, the web app installed from Safari works offline, has its own icon and keeps your data on the device.

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

## iOS app, widgets and Live Activity

The iPhone/iPad app wraps the same web app (Capacitor) and adds native pieces in Swift:

| Piece | Where |
| --- | --- |
| Home Screen widgets: small (next task + ring), medium (next 3 with checkboxes), large (today with times) | `ios/App/Widgets/TodayWidget.swift` |
| Lock Screen widgets: progress ring, next task | `ios/App/Widgets/LockScreenWidgets.swift` |
| Live Activity + Dynamic Island for a running task or focus session, with Done | `ios/App/Widgets/FocusLiveActivity.swift` |
| Check-off and Done actions (App Intents) | `ios/App/Shared/WidgetIntents.swift` |
| Shared store (App Group) and snapshot format | `ios/App/Shared/WidgetData.swift`, `src/lib/widgets.ts` |
| Bridge the web app calls | `ios/App/App/UniversalWidgetsPlugin.swift` |

**One-time setup on a Mac** (Xcode 16 or newer):

1. `brew install xcodegen cocoapods`
2. `npm install && npm run ios:project`. This builds the web app, generates `ios/App/App.xcodeproj` from `ios/App/project.yml` and installs the pods. Run it again after pulling changes.
3. `open ios/App/App.xcworkspace`
4. For **both** targets (**App** and **UniversalWidgets**), open **Signing & Capabilities**, pick your **Team** and keep "Automatically manage signing" on. Xcode registers the bundle IDs and the App Group for you:
   - App: `com.eternalinc.universalplanner`
   - Widgets: `com.eternalinc.universalplanner.widgets`
   - App Group (both): `group.com.eternalinc.universalplanner`

   If a bundle ID is taken, change both IDs in `project.yml`. If you change the App Group, update it in `App/App.entitlements`, `Widgets/UniversalWidgets.entitlements` and `Shared/WidgetData.swift`.
5. Run on an iPhone with iOS 17 or later (widgets and the Live Activity need iOS 17; the app itself runs on iOS 15+).

App Groups need a **paid** Apple Developer account; a free personal team can't sign them, so widgets won't install with one. Live Activities can be turned off per app in iOS Settings → Universal Planner. CI (`.github/workflows/native.yml`) compiles the app and widgets on every push, without signing.

**How the widgets stay current:** whenever tasks change, the app writes a small snapshot of today's and tomorrow's tasks into the App Group and asks WidgetKit to redraw. Checking a task off in a widget updates it right away and queues the change; the app applies the queue as soon as it's opened or comes back to the front. Widgets also redraw on their own at each task's start time and at midnight.

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
| D · W · M · Y, ← → · T | Calendar views, paging, today |
| ⌥1 … ⌥7 / Alt 1 … Alt 7 | Today · Calendar · Notes · Ideas · Health · Insights · Afina |
| ⌘, / Ctrl , | Settings |

**Afina** works on every device with her built-in engine: planning your day, logging food, water, sleep and mood, creating tasks and events, breaking work into steps, and answering questions about your data in English or Russian. For free-form chat, install the on-device model from the Afina screen. It's a one-time download that runs offline and needs WebGPU (Chrome or Edge 113+, Safari 18+, or the desktop app).

**Profiles (accounts):** create as many profiles as you like (sidebar → your name, or Settings → Account). Each profile has its own name, avatar and completely separate data and settings, all on this device; there's no server account. A profile can have a PIN that's asked when the app opens, with optional auto-lock. The PIN keeps others out on a shared device; it isn't encryption. Forgot it? The lock screen can erase that profile and start it fresh.

**Make it yours:** Settings → Appearance has accent palettes (Ocean, Violet, Forest, Sunset, Rose, Graphite or any custom color), background (Aurora, Still, Plain), glass (Frosted, Clear, Solid), fonts (System, Inter, Rounded, Serif, Mono, Hyperlegible) and motion. Settings → Afina changes how Afina looks (colors, glass/soft/ring style, animation) and how she talks (warm, brief, cheerful; by your name or not).

**Connectors** (Settings → Connectors) link the planner to outside services, straight from your device:

| Connector | What it does |
| --- | --- |
| Google, Outlook, iCloud or any `.ics` calendar | Shows that calendar's events next to yours (read-only), refreshed every 30 minutes |
| Public holidays | Adds your country's holidays for this year and next |
| Weather | Forecast widget on Today, a line in Afina's briefing, and answers to "what's the weather?" |
| Webhooks | Sends tasks completed, events added, habits done and more to Zapier, Make, IFTTT, Discord, Slack or any URL |
| Backup folder | Saves a daily backup into a folder you pick (e.g. one iCloud Drive, Dropbox or OneDrive syncs) — Chrome/Edge on a computer, or the desktop app |

Some calendar and webhook services don't accept requests from web browsers. They always work in the desktop and Android apps; in a browser the app tells you when a service blocks it.

**Quick add** (the field on Today → Tasks, the **+** button, ⌘K, or **Add** in a widget) understands phrases such as "Gym tomorrow 7pm", "Call mom every Sunday at 6", "Pay rent on the 1st of every month" and "Read 20 min tonight !high", in English and Russian. It highlights what it understood as you type and previews the task. If something is ambiguous ("at 6", "next Friday"), it makes a sensible guess and offers the other reading as a one-tap chip; repeat, priority and duration are one tap too. Saving is never blocked. The mic button dictates with the device's own speech recognition. Afina understands the same phrases. Repeating tasks schedule their next occurrence when you finish them.

**Widgets:** iOS has Home and Lock Screen widgets plus a Live Activity (see above). On Android, long-press the home screen → Widgets → Universal Planner. The widget resizes from a progress ring with your next task to today's list with checkboxes. Focus sessions show an ongoing notification with a countdown and **Done** (Android 13+ asks for notification permission the first time).

**Only what you add:** new profiles start empty. Sample data is never added automatically; Settings → Privacy & data → **Add sample data** adds it if you want to look around first.

**Your data:** Settings → Privacy & data exports a full backup (`.json`) of the current profile and imports it on another device. Sample data from onboarding can be removed there with one click.

## Project layout

```
src/
  app/            shell, router, sidebar, tab bar, command bar, quick capture
  ui/             shared components (Glass, TiltCard, Button, Sheet, charts, drag and drop…)
  lib/            db (Dexie), actions, natural-language parsing, settings, i18n (EN/RU), backup
  features/
    today/  calendar/  planner/  notes/  ideas/  diet/  analytics/  afina/
    account/  connectors/  onboarding/  settings/
electron/         desktop shell and self-updater
android/          Capacitor Android project, home screen widget, focus notification
ios/App/          iOS app: project.yml (XcodeGen), widget extension, Live Activity, App Intents
public/brand/     logos and app icons
```

---

© Eternal Inc. All rights reserved.
