import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startLocalSabotPress } from './local-server.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let runtime = null
let mainWindow = null

function appRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..')
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'SabotPress',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Open publication data folder', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'services' } : null,
        { role: 'quit' },
      ].filter(Boolean),
    },
    {
      label: 'Publish',
      submenu: [
        { label: 'Publish Online…', accelerator: 'CmdOrCtrl+Shift+P', click: () => openPublishOnline() },
        { label: 'Domain setup', click: () => mainWindow?.loadURL(`${runtime.url}/sites`) },
        { label: 'Backups', click: () => mainWindow?.loadURL(`${runtime.url}/backup`) },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Install and hosting guide', click: () => shell.openExternal('https://github.com/sabotmedia/sabotpress/blob/main/docs/INSTALL.md') },
        { label: 'Noblogs / WordPress migration', click: () => shell.openExternal('https://github.com/sabotmedia/sabotpress/blob/main/docs/NOBLOGS_MIGRATION.md') },
      ],
    },
  ])
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    title: 'SabotPress',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith(runtime.url)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })

  await mainWindow.loadURL(`${runtime.url}/admin`)
}

function openPublishOnline() {
  if (!mainWindow || !runtime) return
  mainWindow.loadURL(`${runtime.url}/settings?desktop-publish=1`)
}

ipcMain.handle('desktop:open-external', async (_event, url) => {
  if (!/^https?:\/\//i.test(url)) return false
  await shell.openExternal(url)
  return true
})
ipcMain.handle('desktop:open-data-folder', async () => shell.openPath(app.getPath('userData')))
ipcMain.handle('desktop:publish-online', async () => { openPublishOnline(); return true })
ipcMain.handle('desktop:app-info', async () => ({ platform: process.platform, version: app.getVersion(), dataRoot: app.getPath('userData') }))

app.whenReady().then(async () => {
  runtime = await startLocalSabotPress({ appRoot: appRoot(), dataRoot: app.getPath('userData') })
  Menu.setApplicationMenu(buildMenu())
  await createMainWindow()
  app.on('activate', async () => { if (BrowserWindow.getAllWindows().length === 0) await createMainWindow() })
}).catch((error) => {
  console.error(error)
  app.quit()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('before-quit', () => { runtime?.close?.().catch?.(() => {}) })
