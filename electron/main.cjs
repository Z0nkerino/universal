// Universal Planner desktop shell (macOS + Windows). Serves the built web app over a
// private app:// scheme so IndexedDB and storage behave exactly like the installed PWA.
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createUpdater } = require('./updater.cjs');

const ROOT = path.join(__dirname, '..', 'dist-desktop');
const isMac = process.platform === 'darwin';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let updater = null;
let bootTimer = null;

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const BOOT_TIMEOUT_MS = Number(process.env.UP_BOOT_TIMEOUT_MS) || 20_000;

/** Loads the app; if a downloaded version doesn't report healthy within 20s, fall back to the built-in one. */
function loadApp() {
  clearTimeout(bootTimer);
  const { version, downloaded } = updater.active;
  if (downloaded) {
    bootTimer = setTimeout(() => {
      updater.markBad(version);
      win?.loadURL('app://planner/');
    }, BOOT_TIMEOUT_MS);
  }
  win.loadURL('app://planner/');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: 'Universal Planner',
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0A0A0A' : '#FFFFFF',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 34, y: 34 },
    autoHideMenuBar: !isMac,
    icon: path.join(ROOT, 'brand', 'icon-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  win.once('ready-to-show', () => win.show());
  loadApp();

  // Links to other sites open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://planner/')) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  win.on('closed', () => (win = null));
}

function buildMenu() {
  const template = [
    ...(isMac
      ? [{ label: app.name, submenu: [{ role: 'about' }, { label: 'Check for Updates…', click: () => checkFromMenu() }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }]
      : []),
    ...(isMac ? [] : [{ label: 'Help', submenu: [{ label: 'Check for Updates…', click: () => checkFromMenu() }, { role: 'about' }] }]),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function checkFromMenu() {
  const s = await updater.check({ manual: true });
  const messages = {
    current: ['You’re up to date', `Universal Planner ${s.version} is the newest version.`],
    ready: [`Version ${s.version} is ready`, 'Use “Restart to update” in the app to switch to it.'],
    installer: [`Version ${s.version} is available`, 'This update needs a fresh download of the app.'],
    unavailable: ['Couldn’t check for updates', s.message],
    error: ['Update failed', s.message],
  };
  const [message, detail] = messages[s.state] || ['Checking for updates…', ''];
  const buttons = s.state === 'installer' ? ['Download', 'Later'] : ['OK'];
  const { response } = await dialog.showMessageBox(win, { message, detail, buttons, defaultId: 0 });
  if (s.state === 'installer' && response === 0) shell.openExternal(s.url);
}

function registerIpc() {
  ipcMain.on('app:ready', () => clearTimeout(bootTimer));
  ipcMain.handle('update:status', () => ({ ...updater.status, current: updater.active.version }));
  ipcMain.handle('update:check', () => updater.check({ manual: true }));
  ipcMain.handle('update:apply', () => {
    if (updater.apply()) loadApp();
  });
  ipcMain.handle('update:download', (_e, url) => {
    if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url);
  });
  // Connectors (calendar feeds, webhooks…) go through here: unlike the page, the main process
  // isn't bound by CORS. Only http(s), with a timeout and a size cap.
  ipcMain.handle('net:request', async (_e, { url, method = 'GET', headers = {}, body }) => {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https addresses are allowed.');
    const res = await net.fetch(u.href, { method, headers, body, signal: AbortSignal.timeout(20_000) });
    const text = await res.text();
    if (text.length > 20 * 1024 * 1024) throw new Error('The response is too large.');
    return { status: res.status, text };
  });
}

app.setAboutPanelOptions({
  applicationName: 'Universal Planner',
  applicationVersion: app.getVersion(),
  copyright: `© ${new Date().getFullYear()} Eternal Inc. All rights reserved.`,
  credits: 'Designed and built by Eternal Inc.',
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  updater = createUpdater({ builtinRoot: ROOT, onStatus: (s) => win?.webContents.send('update:status', { ...s, current: updater.active.version }) });
  protocol.handle('app', (req) => {
    const root = updater.active.root;
    const { pathname } = new URL(req.url);
    let file = path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root)) return new Response('Not found', { status: 404 });
    if (pathname === '/' || !path.extname(file)) file = path.join(root, 'index.html');
    return net.fetch(pathToFileURL(file).toString());
  });
  registerIpc();
  buildMenu();
  createWindow();
  if (app.isPackaged || process.env.UP_UPDATE_FEED) {
    setTimeout(() => updater.check(), 5_000);
    setInterval(() => updater.check(), CHECK_EVERY_MS);
  }
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
