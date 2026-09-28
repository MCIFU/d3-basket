# D3 Basket

Aplicación de **scouting y análisis estadístico de baloncesto español**: ACB (Liga Endesa), LEB Oro (Primera FEB) y LEB Plata (Segunda FEB).
Funciona como **app de escritorio** (Windows/macOS/Linux) y como **web** en cualquier navegador moderno (Chrome, Firefox, Brave, Edge, Safari), publicada en Netlify: **https://d3basket.netlify.app**.

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

## Versión web (navegador y Netlify)

La web usa exactamente la misma interfaz que la app de escritorio. La diferencia es de dónde salen los datos:

- En cada *build* de Netlify se ejecuta el scraper, se exporta una copia compacta y comprimida de la base de datos (`data/d3basket.db.gz`, ~120 KB) y se publica junto a la web estática.
- El navegador abre esa base de datos con **SQLite en WebAssembly** (sql.js) y hace las mismas consultas que la app de escritorio. No hay servidor ni API que mantener.
- Los **informes de scouting** se guardan en el navegador de cada usuario (`localStorage`), ligados al id oficial del jugador, y se pueden **exportar/importar** en JSON desde *Scouting*. Los informes de tu app de escritorio nunca se publican.
- La base de datos se conserva entre *builds* (plugin local `netlify/plugins/cache-db`), así cada actualización solo pide lo nuevo.
- **Actualización diaria automática:** la función programada `netlify/functions/refresh-data.mts` lanza un *build* cada día a las 06:00 UTC si existe la variable `BUILD_HOOK_URL`.

```bash
npm run export:web     # exporta tu BD local a data/web/ para probar la web
npm run dev:web        # web en modo desarrollo (http://localhost:5174)
npm run build:web      # web estática en dist-web/
```

### Configuración en Netlify (una sola vez)

1. **Enlazar el repositorio:** *Project configuration → Build & deploy → Link repository* → GitHub → `MCIFU/d3-basket`. El `netlify.toml` ya define el comando (`npm run build:netlify`) y la carpeta (`dist-web`). Cada `git push` a `main` publica una versión nueva.
2. **Build hook para la actualización diaria:** *Build & deploy → Build hooks → Add build hook* (rama `main`) y guarda su URL como variable de entorno `BUILD_HOOK_URL` (*Environment variables*).
3. **Acceso público:** si el proyecto tiene activada la protección de visitantes (*Visitor access / login de equipo*), desactívala para que cualquiera pueda abrir la web.

## Scraper (CLI)

```bash
npm run scrape -- sync acb                         # temporada actual (incremental)
npm run scrape -- sync acb --no-players            # sin fichas biográficas (rápido, ~30 s)
npm run scrape -- sync acb --season 2025           # histórico 2025-26 (experimental)
npm run scrape -- sync acb --force                 # vuelve a descargar todos los boxscores
npm run scrape -- editions acb                     # temporadas disponibles en acb.com
npm run scrape -- info                             # resumen de la base de datos
npm run scrape -- export-web                       # publica los datos para la versión web
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
  renderer/    interfaz React (compartida por escritorio y web; web/ = API con sql.js)
  shared/      contrato de la API entre main y renderer
tests/         vitest + fixtures
docs/          arquitectura, modelo de datos y estrategia de scraping
netlify/       plugin de caché de la BD y función programada de actualización
```

Más detalle en **[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)**.

## Uso responsable de los datos

Los datos pertenecen a la ACB y a la FEB. El scraper hace peticiones secuenciales (1 por segundo), se identifica con su propio `User-Agent`, respeta `robots.txt` y solo lee páginas públicas. Está pensado para uso personal de análisis y scouting, no para redistribuir los datos.
