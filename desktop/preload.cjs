const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sabotDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', String(url || '')),
  openDataFolder: () => ipcRenderer.invoke('desktop:open-data-folder'),
  showPublishOnline: () => ipcRenderer.invoke('desktop:publish-online'),
  appInfo: () => ipcRenderer.invoke('desktop:app-info'),
})
