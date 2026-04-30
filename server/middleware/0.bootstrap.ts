import { mkdirSync, existsSync } from 'node:fs'
import { db } from '../db/client'
import { categoryDefinitions } from '../db/schema'
import { DEFAULT_CATEGORIES } from '~~/shared/constants/default-categories'

let isBootstrapped = false
let bootstrapError: Error | null = null

async function bootstrap(): Promise<void> {
  for (const dir of ['_data', '_data/raw']) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
      console.warn(`[bootstrap] créé ${dir}`)
    }
  }

  let tableExists = true
  try {
    db.select().from(categoryDefinitions).limit(1).all()
  }
  catch (err) {
    if (err instanceof Error && /no such table/i.test(err.message)) {
      tableExists = false
    }
    else {
      throw err
    }
  }

  if (!tableExists) {
    throw new Error(
      'Base de données non initialisée. Lance `yarn db:push` (ou `yarn apply-migration` si tu utilises les migrations) puis relance le serveur.',
    )
  }

  const inserted = db
    .insert(categoryDefinitions)
    .values(
      DEFAULT_CATEGORIES.map(c => ({
        code: c.code,
        label: c.label,
        isVariable: c.isVariable,
      })),
    )
    .onConflictDoNothing({ target: categoryDefinitions.code })
    .run()

  console.warn(`[bootstrap] OK — base prête (${inserted.changes} catégorie(s) insérée(s))`)
}

export default defineEventHandler(async () => {
  if (isBootstrapped) return
  if (bootstrapError) throw bootstrapError

  try {
    await bootstrap()
    isBootstrapped = true
  }
  catch (err) {
    bootstrapError = err instanceof Error ? err : new Error(String(err))
    console.error('[bootstrap] échec :', bootstrapError)
    throw bootstrapError
  }
})
