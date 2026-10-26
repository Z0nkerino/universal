const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  /** Tells the shell this version booted fine (otherwise it rolls back to the built-in one). */
  ready: () => ipcRenderer.send('app:ready'),
  updates: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    apply: () => ipcRenderer.invoke('update:apply'),
    download: (url) => ipcRenderer.invoke('update:download', url),
    onStatus: (cb) => {
      const fn = (_e, s) => cb(s);
      ipcRenderer.on('update:status', fn);
      return () => ipcRenderer.removeListener('update:status', fn);
    },
  },
});
