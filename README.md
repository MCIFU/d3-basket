# D3 Basket

Aplicación de escritorio de **scouting y análisis estadístico de baloncesto español**: ACB (Liga Endesa), LEB Oro (Primera FEB) y LEB Plata (Segunda FEB).

**Stack:** Electron · React · TypeScript · SQLite (better-sqlite3) · Vite (electron-vite) · Vitest

## Estado — fase 1

| | |
|---|---|
| ✅ Esquema SQLite | temporadas, competiciones, clubes/equipos, jugadores, plantillas, cuerpo técnico, calendario, boxscores por cuarto, informes de scouting, registro de sincronizaciones |
| ✅ Scraper ACB | calendario completo, resultados, plantillas (con licencias y bajas), cuerpo técnico, fichas biográficas y boxscores de **acb.com** |
| ✅ Histórico ACB | temporadas pasadas (experimental): `--season 2025` |
| ✅ App de escritorio | clasificación, líderes, calendario por jornada, fichas de equipo y jugador (medias, TS%, eFG%, partido a partido), boxscores e informes de scouting con valoración por atributos |
| ⏳ LEB Oro / LEB Plata | esquema listo; falta el adaptador de `baloncestoenvivo.feb.es` (ver [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)) |

La temporada 2026-27 de la ACB arrancó el 26-27 de septiembre de 2026: la primera sincronización ya trae los 9 resultados y boxscores de la jornada 1 y los 297 partidos restantes del calendario.

## Puesta en marcha

Requisitos: Node.js ≥ 22 y Windows, macOS o Linux. No hace falta compilar nada nativo.

```bash
npm install
npm run scrape:acb     # primera sincronización de la temporada actual (~4-5 min)
npm run dev            # abre la app
```

También se puede sincronizar desde la propia app (Inicio → *Sincronizar*).

## Scraper (CLI)

```bash
npm run scrape -- sync acb                         # temporada actual (incremental)
npm run scrape -- sync acb --no-players            # sin fichas biográficas (rápido, ~30 s)
npm run scrape -- sync acb --season 2025           # histórico 2025-26 (experimental)
npm run scrape -- sync acb --force                 # vuelve a descargar todos los boxscores
npm run scrape -- editions acb                     # temporadas disponibles en acb.com
npm run scrape -- info                             # resumen de la base de datos
```

Opciones: `--db <ruta>` · `--delay <ms>` (pausa entre peticiones, 1000 por defecto) · `--cache` (guarda el HTML en `data/cache/` para depurar) · `--max-boxscores N` · `--player-max-age <días>`.

Base de datos por defecto: `%APPDATA%\D3Basket\d3basket.db` (Windows), `~/Library/Application Support/D3Basket/` (macOS) o `~/.config/D3Basket/` (Linux). Cámbiala con la variable `D3_DB_PATH`. La app y la CLI comparten la misma.

## Scripts

| | |
|---|---|
| `npm run dev` | App en modo desarrollo |
| `npm run build` | Compila main, preload y renderer en `out/` |
| `npm test` | Tests (parsers con páginas reales de acb.com guardadas en `tests/fixtures`, parser RSC y base de datos) |
| `npm run typecheck` | Comprobación de tipos |
| `npm run dist` | Instalador de Windows (electron-builder) |

## Estructura

```
src/
  db/          esquema (migrations.ts), escritura idempotente (writer.ts), consultas (queries.ts)
  scraper/
    core/      cliente HTTP educado (http.ts) y parser del payload de Next.js (rsc.ts)
    acb/       urls, parsers y orquestador de sincronización de la ACB
    types.ts   modelo normalizado común a todas las ligas
  cli/         CLI del scraper
  main/        proceso principal de Electron (IPC)
  preload/     puente seguro renderer ↔ main
  renderer/    interfaz React
  shared/      contrato de la API entre main y renderer
tests/         vitest + fixtures
docs/          arquitectura, modelo de datos y estrategia de scraping
```

Más detalle en **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)**.

## Uso responsable de los datos

Los datos pertenecen a la ACB y a la FEB. El scraper hace peticiones secuenciales (1 por segundo), se identifica con su propio `User-Agent`, respeta `robots.txt` y solo lee páginas públicas. Está pensado para uso personal de análisis y scouting, no para redistribuir los datos.
