import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { installSeedIfMissing } from '../src/db/seed'

describe('semilla de la app de escritorio', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd3-seed-'))
  const seed = path.join(dir, 'seed.db.gz')
  fs.writeFileSync(seed, zlib.gzipSync(Buffer.from('SQLite format 3\0datos')))

  it('instala la semilla en el primer arranque', () => {
    const db = path.join(dir, 'sub', 'd3basket.db')
    expect(installSeedIfMissing(db, seed)).toBe(true)
    expect(fs.readFileSync(db, 'utf8')).toBe('SQLite format 3\0datos')
  })

  it('nunca pisa una base de datos existente', () => {
    const db = path.join(dir, 'existente.db')
    fs.writeFileSync(db, 'mis informes')
    expect(installSeedIfMissing(db, seed)).toBe(false)
    expect(fs.readFileSync(db, 'utf8')).toBe('mis informes')
  })

  it('sin semilla no hace nada', () => {
    expect(installSeedIfMissing(path.join(dir, 'otra.db'), path.join(dir, 'no-existe.gz'))).toBe(false)
  })
})
