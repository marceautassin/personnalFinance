import { drizzle } from 'drizzle-orm/better-sqlite3'
import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import * as schema from './schema'

const DB_PATH = process.env.DATABASE_URL ?? './_data/personnalfinance.db'

mkdirSync(dirname(DB_PATH), { recursive: true })

const sqlite = new Database(DB_PATH)
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('journal_mode = WAL')

export const db = drizzle(sqlite, { schema })
export type DB = typeof db
