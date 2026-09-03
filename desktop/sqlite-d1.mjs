import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'

export function openDesktopDatabase({ databasePath, schemaDirectory }) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  const sqlite = new Database(databasePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  if (schemaDirectory && fs.existsSync(schemaDirectory)) {
    const files = fs.readdirSync(schemaDirectory).filter((name) => name.endsWith('.sql')).sort()
    for (const name of files) {
      const sql = fs.readFileSync(path.join(schemaDirectory, name), 'utf8')
      if (sql.trim()) sqlite.exec(sql)
    }
  }

  return new DesktopD1Database(sqlite)
}

class DesktopD1Database {
  constructor(sqlite) { this.sqlite = sqlite }

  prepare(sql) { return new DesktopD1Statement(this.sqlite, sql) }

  async exec(sql) {
    this.sqlite.exec(String(sql || ''))
    return { count: 0, duration: 0 }
  }

  async batch(statements = []) {
    const transaction = this.sqlite.transaction((items) => items.map((statement) => statement._runNow()))
    return transaction(statements)
  }

  async backup(destination) {
    return this.sqlite.backup(destination)
  }

  close() { this.sqlite.close() }
}

class DesktopD1Statement {
  constructor(sqlite, sql, values = []) {
    this.sqlite = sqlite
    this.sql = String(sql || '')
    this.values = values
  }

  bind(...values) { return new DesktopD1Statement(this.sqlite, this.sql, values) }

  _statement() { return this.sqlite.prepare(this.sql) }
  _runNow() {
    const result = this._statement().run(...this.values)
    return d1RunResult(result)
  }

  async run() { return this._runNow() }

  async first(column) {
    const row = this._statement().get(...this.values)
    if (row == null) return null
    return column ? row[column] ?? null : row
  }

  async all() {
    const rows = this._statement().all(...this.values)
    return { success: true, results: rows, meta: { changes: 0, duration: 0 } }
  }

  async raw(options = {}) {
    const rows = this._statement().raw(true).all(...this.values)
    if (options.columnNames) {
      const columns = this._statement().columns().map((column) => column.name)
      return [columns, ...rows]
    }
    return rows
  }
}

function d1RunResult(result = {}) {
  return {
    success: true,
    meta: {
      changes: Number(result.changes || 0),
      last_row_id: result.lastInsertRowid == null ? null : Number(result.lastInsertRowid),
      duration: 0,
    },
  }
}
