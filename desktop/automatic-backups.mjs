import fs from 'node:fs'
import path from 'node:path'

const SETTINGS_FILE = 'backup-settings.json'
const DEFAULT_SETTINGS = {
  enabled: true,
  frequency: 'daily',
  retention: 7,
  lastRunAt: '',
}

function settingsPath(dataRoot) {
  return path.join(dataRoot, SETTINGS_FILE)
}

export function backupRoot(dataRoot) {
  return path.join(dataRoot, 'backups')
}

export function loadBackupSettings(dataRoot) {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(dataRoot), 'utf8'))
    return normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed })
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveBackupSettings(dataRoot, next) {
  const settings = normalizeSettings({ ...loadBackupSettings(dataRoot), ...(next || {}) })
  fs.mkdirSync(dataRoot, { recursive: true })
  fs.writeFileSync(settingsPath(dataRoot), JSON.stringify(settings, null, 2), 'utf8')
  return settings
}

function normalizeSettings(input) {
  const frequency = ['daily', 'weekly'].includes(input?.frequency) ? input.frequency : 'daily'
  const retention = Math.min(30, Math.max(1, Number(input?.retention || 7)))
  return {
    enabled: input?.enabled !== false,
    frequency,
    retention,
    lastRunAt: typeof input?.lastRunAt === 'string' ? input.lastRunAt : '',
  }
}

function intervalMs(frequency) {
  return frequency === 'weekly' ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
}

export function backupDue(settings, now = Date.now()) {
  if (!settings?.enabled) return false
  if (!settings.lastRunAt) return true
  const last = new Date(settings.lastRunAt).getTime()
  if (!Number.isFinite(last)) return true
  return now - last >= intervalMs(settings.frequency)
}

function backupName(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

export async function createDesktopBackup({ dataRoot, db, mediaRoot, reason = 'manual' }) {
  const root = backupRoot(dataRoot)
  fs.mkdirSync(root, { recursive: true })
  const dir = path.join(root, backupName())
  fs.mkdirSync(dir, { recursive: true })

  const databaseFile = path.join(dir, 'sabotpress.sqlite3')
  await db.backup(databaseFile)

  if (mediaRoot && fs.existsSync(mediaRoot)) {
    fs.cpSync(mediaRoot, path.join(dir, 'media'), { recursive: true })
  }

  const manifest = {
    format: 'sabotpress-desktop-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    reason,
    includes: ['database', 'media'],
  }
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

  const settings = loadBackupSettings(dataRoot)
  const saved = saveBackupSettings(dataRoot, { ...settings, lastRunAt: manifest.createdAt })
  pruneBackups(root, saved.retention)

  return { ok: true, path: dir, createdAt: manifest.createdAt, reason }
}

function pruneBackups(root, retention) {
  const entries = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ name: entry.name, path: path.join(root, entry.name) }))
    .sort((a, b) => b.name.localeCompare(a.name))
  for (const stale of entries.slice(retention)) fs.rmSync(stale.path, { recursive: true, force: true })
}

export async function runAutomaticBackupIfDue({ dataRoot, db, mediaRoot }) {
  const settings = loadBackupSettings(dataRoot)
  if (!backupDue(settings)) return { ok: true, skipped: true, settings }
  const result = await createDesktopBackup({ dataRoot, db, mediaRoot, reason: 'scheduled' })
  return { ...result, settings: loadBackupSettings(dataRoot) }
}
