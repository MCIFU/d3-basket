// Descomprime la base de datos descargada (d3basket.db.gz) sin depender de gzip, que Windows no trae.
// Uso: node tools/site/unzip-db.mjs data/d3basket.db.gz data/d3basket.db
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
const [from, to] = process.argv.slice(2)
writeFileSync(to, gunzipSync(readFileSync(from)))
console.log(`Base de datos lista: ${to}`)
