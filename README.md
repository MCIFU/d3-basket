# D3 Basket

Aplicación de **scouting y análisis estadístico de baloncesto español**: ACB (Liga Endesa), Primera FEB (LEB Oro), Segunda FEB (LEB Plata) y Tercera FEB.
Funciona como **app de escritorio** (Windows/macOS/Linux) y como **web** en cualquier navegador moderno (Chrome, Firefox, Brave, Edge, Safari), publicada en Netlify: **https://d3basket.netlify.app**.

**Stack:** Electron · React · TypeScript · SQLite (better-sqlite3) · Vite (electron-vite) · Vitest

## Qué incluye

| | |
|---|---|
| ✅ Portada | campeones vigentes con sus trofeos, últimos resultados y próxima jornada, líderes con foto, clasificación con forma |
| ✅ Ligas | por temporada: clasificación, calendario y resultados, estadísticas de equipos (incluidos espectadores) y de jugadores (medias y totales, TS%, eFG%…), palmarés de Liga/Copa/Supercopa desde 1956 y clasificación histórica; **evolución de la clasificación jornada a jornada** con equipos destacados |
| ✅ Equipos | escudo, pabellón (foto, aforo, ocupación), fundación, web y redes, historia, vitrina de trofeos con años de campeonatos y subcampeonatos, **rendimiento con el puesto en la liga de cada estadística**, líderes con foto, últimos resultados, balance en casa y fuera, plantilla con fotos agrupada por posición, estadísticas y partidos |
| ✅ Jugadores | foto sin fondo, fecha y lugar de nacimiento, posición, altura, licencia, equipo; **trayectoria completa** (línea de tiempo con escudos y categorías + gráfica de puntos y valoración por temporada), estadísticas completas (por partido, totales y por 40 minutos, con TS%, eFG%, mates, faltas recibidas, +/−…), carrera ACB, récords personales y partido a partido |
| ✅ Comparador | dos jugadores cara a cara (`#/comparar`), cada uno en la temporada que elijas: barras emparejadas por partido o por 40 minutos, con detalle al pasar el ratón |
| ✅ Scouting | informes de ojeador con valoración por atributos (en la web, guardados en el navegador con exportación/importación) |
| ✅ Enlaces reales | cada página tiene su URL (`#/jugador/sergio-llull-20201774`): se puede compartir y abrir en otra pestaña con el botón central o Ctrl+clic |
| ✅ Scraper ACB | calendario, resultados, plantillas, fichas, boxscores, datos de club, trayectorias y clasificación histórica de **acb.com**; palmarés e historia de **Wikipedia** |
| ✅ Primera FEB (LEB Oro) | calendario, resultados, estadísticas por partido, plantillas con fotos sin fondo, datos de club y **trayectoria completa de cada jugador en todas las categorías FEB** (`baloncestoenvivo.feb.es`) |
| ✅ Histórico ACB | temporadas 2025-26 y 2024-25 completas, y trayectoria de todos los jugadores actuales desde su debut |
| ✅ Segunda y Tercera FEB | mismas páginas y datos que la Primera FEB; ligas divididas en grupos (Segunda: A y B; Tercera: 10 grupos) con clasificación y calendario por grupo |
| ✅ Eliminatorias y Copa España | playoffs de ascenso, finales y permanencia de las ligas FEB (desde la página de resultados de la FEB), rondas de playoff de la ACB deducidas del cuadro, y la Copa España de la FEB |
| ✅ Histórico | ACB 2021-22 a 2026-27; FEB (Primera, Segunda, Tercera y Copa) 2023-24 a 2026-27; un mismo club queda unido entre temporadas y ligas |
| ✅ Auditoría | `npm run scrape -- check`: marcadores contra estadísticas, partidos sin estadística, calendarios incompletos, clubes y jugadores duplicados |
| ✅ Identidad visual | modo claro/oscuro (sigue al sistema o se fija en la cabecera); colores y logos oficiales de cada liga; escudos homogéneos y colores de cada club; fotos FEB en primer plano como las de la ACB (ver *Fotos, escudos y colores*) |

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
npm run export:web     # exporta tu BD local a public/data/ para probar la web
npm run dev:web        # web en modo desarrollo (http://localhost:5174)
npm run build:web      # web estática en dist-web/
```

### Configuración en Netlify (una sola vez)

0. **Semilla de datos:** `seed/d3basket.db.gz` es una copia completa (trayectorias e históricos incluidos) generada en local con `npm run seed -- --db <tu.db>`. El build (`restore-db`) la usa si es más nueva que la caché; si no, sigue con la caché o descarga la base de datos publicada en la web. Así Netlify solo tiene que pedir lo nuevo.
1. **Enlazar el repositorio:** *Project configuration → Build & deploy → Link repository* → GitHub → `MCIFU/d3-basket`. El `netlify.toml` ya define el comando (`npm run build:netlify`) y la carpeta (`dist-web`). Cada `git push` a `main` publica una versión nueva.
2. **Build hook para la actualización diaria:** *Build & deploy → Build hooks → Add build hook* (rama `main`) y guarda su URL como variable de entorno `BUILD_HOOK_URL` (*Environment variables*).
3. **Acceso público:** si el proyecto tiene activada la protección de visitantes (*Visitor access / login de equipo*), desactívala para que cualquiera pueda abrir la web.

## Fotos, escudos y colores (`public/media`)

Las fotos de la FEB llegan de medio cuerpo o con fondo, y cada escudo tiene márgenes distintos. `tools/media` los deja todos como los de la ACB:

- **`faces.py`**: quita el fondo si lo hay (rembg, `u2net_human_seg`), detecta la cara (YuNet de OpenCV) y recorta con el encuadre de acb.com (cara al 50 % del ancho, ojos al 38,6 % del alto, 5:6) → `public/media/players/<ref>.webp`.
- **`logos.py`**: quita fondos lisos, recorta el margen vacío y centra cada escudo en 256×256 → `public/media/logos/<ref>.png`. De cada escudo saca los dos colores del club → `public/media/colors.json` (en la ACB se respeta el color oficial de acb.com).
- `src/db/media.ts` (`applyMedia`) aplica todo esto a la base de datos al exportar la web y en la app de escritorio. Si falta algún fichero se usa el original.

```bash
pip install pillow numpy opencv-python-headless "rembg[cpu]"
python tools/media/logos.py                  # escudos y colores nuevos
python tools/media/faces.py --shard 0/3 &    # fotos nuevas (en paralelo: 0/3, 1/3, 2/3)
python tools/media/faces.py --recheck        # rehace las dudosas (restos de fondo, huecos)
# tools/media/players-skip.txt: jugadores sin foto en la FEB o sin cara; no se reintentan (salvo --force)
```

Solo procesa lo que falta; después hay que hacer commit de `public/media`. Los jugadores que lleguen después en el build diario usan la foto original de la FEB hasta la siguiente pasada.

- **`club_wiki.py`**: fundación e historia de los clubes FEB desde Wikipedia/Wikidata (solo acepta artículos cuyo elemento de Wikidata es un club de baloncesto español). Genera `tools/media/club-wiki.json` para revisarlo a mano (`"ok": false` descarta un emparejamiento) y se importa con `npm run scrape -- import-club-wiki tools/media/club-wiki.json`.

Los colores y logos de cada liga están en `src/renderer/src/leagues.ts` y `public/media/leagues` (paleta de acb.com y logos oficiales de la FEB).

## Scraper (CLI)

```bash
npm run scrape -- sync acb                         # temporada actual (incremental)
npm run scrape -- sync acb --no-players            # sin fichas biográficas (rápido, ~30 s)
npm run scrape -- sync acb --season 2025           # histórico 2025-26
npm run scrape -- sync primera-feb                 # Primera FEB (LEB Oro) en curso
npm run scrape -- sync segunda-feb                 # Segunda FEB (LEB Plata)
npm run scrape -- sync tercera-feb                 # Tercera FEB (10 grupos)
npm run scrape -- sync tercera-feb --max-bios 150  # como mucho 150 fichas por ejecución (build diario)
npm run scrape -- sync copa-espana                 # Copa España (FEB)
npm run scrape -- check                            # auditoría de integridad de los datos
npm run scrape -- sync acb --force                 # vuelve a descargar boxscores y refresca la historia
npm run scrape -- sync acb --career-budget 1000    # descarga más trayectorias de jugadores de una vez
npm run scrape -- editions acb                     # temporadas disponibles en acb.com
npm run scrape -- info                             # resumen de la base de datos
npm run scrape -- export-web                       # publica los datos para la versión web
```

Opciones: `--db <ruta>` · `--delay <ms>` (pausa entre peticiones, 1000 por defecto) · `--cache` (guarda el HTML en `data/cache/` para depurar) · `--max-boxscores N` · `--player-max-age <días>` · `--no-history` · `--no-careers` · `--career-budget N` (páginas de trayectoria por ejecución, 250 por defecto).

La **historia** (clasificación histórica, cuadro de honor, palmarés e historia de los clubes) se refresca como mucho una vez por semana. Las **trayectorias** de los jugadores (una página por jugador y temporada pasada, ~900 en total) se completan poco a poco: 250 por ejecución, empezando por las temporadas más recientes; las temporadas cerradas no se vuelven a pedir.

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
