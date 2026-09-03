const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sabotDesktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron,
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', String(url || '')),
  openDataFolder: () => ipcRenderer.invoke('desktop:open-data-folder'),
  openBackupFolder: () => ipcRenderer.invoke('desktop:open-backup-folder'),
  showPublishOnline: () => ipcRenderer.invoke('desktop:publish-online'),
  appInfo: () => ipcRenderer.invoke('desktop:app-info'),
  getBackupSettings: () => ipcRenderer.invoke('desktop:backup-settings'),
  setBackupSettings: (settings) => ipcRenderer.invoke('desktop:set-backup-settings', settings),
  backupNow: () => ipcRenderer.invoke('desktop:backup-now'),
})
