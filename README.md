# d3 basket

Web personal de **resultados, estadísticas, trayectorias y palmarés del baloncesto**: Liga Endesa, Primera, Segunda y Tercera FEB, Copa España y Campeonatos de España, EuroLeague, EuroCup, Champions League y las ligas de Italia, Alemania, Francia, Grecia y Turquía.

## Abrirla

| | Cómo |
|---|---|
| 💻 En tu PC | Doble clic en **`iniciar.bat`** (necesita Node.js y Git). Descarga la última versión y los datos del día, monta la web y la abre en `http://localhost:4173`. |
| 🌐 En internet | `https://d3-basket.pages.dev`, publicada cada día a las 08:00 (hora española) por `.github/workflows/web.yml`. |

## Qué incluye

- **Hoy**: partidos de la semana por competición, partido destacado del día, mejores actuaciones y favoritos.
- **Competiciones**: clasificación con zonas y racha, jornadas, líderes y estadística completa de cada temporada.
- **Clubes**: plantilla con fotos, resultados, estadísticas, palmarés, filiales y todas sus temporadas.
- **Jugadores**: medias con su puesto en la liga, radar de percentiles, partido a partido, palmarés con sus clubes y medallas con España, récords, trayectoria y todos sus partidos.
- **Partidos**: marcador, parciales, comparativa, mejores del partido y boxscore.
- **Explorador**, **Españoles por el mundo** y **comparador** de dos jugadores.
- Buscador con `Ctrl+K`, tema claro y oscuro, móvil, favoritos guardados en el navegador.

## Cómo funciona

```
scrapers (src/scraper) ──► SQLite (data/d3basket.db) ──► tools/site/export.ts ──► public/d/*.json ──► web (site/)
```

1. **Datos**: los programas de `src/scraper` descargan cada liga de su fuente oficial y la guardan en SQLite (`src/db`).
2. **Exportación**: `tools/site/export.ts` convierte la base de datos en ficheros JSON pequeños (uno por temporada de liga, y jugadores, clubes y partidos agrupados en cubos). Cada página baja solo lo que muestra, unos 20 KB.
3. **Web**: `site/` es una aplicación React sin servidor, con enrutado por almohadilla (`#/jugador/…`).
4. **Publicación diaria** (`web.yml`): sincroniza las ligas, exporta, construye, pasa las pruebas y publica en Cloudflare Pages. La base de datos del día se sube a la versión «datos» de GitHub, de donde la descarga `iniciar.bat`.

### Configurar Cloudflare Pages (una sola vez)

1. Cuenta gratuita en [dash.cloudflare.com](https://dash.cloudflare.com).
2. *Account ID* (Workers y Pages) y un token con permiso *Cloudflare Pages · Edit*.
3. En GitHub, *Settings → Secrets and variables → Actions*: `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_API_TOKEN`.

## Scripts

| | |
|---|---|
| `npm run site:data` | Exporta `data/d3basket.db` a `public/d` (unos 30 s) |
| `npm run site:dev` | Web en modo desarrollo (`http://localhost:5175`) |
| `npm run site:build` | Construye la web en `dist-site/` |
| `npm run site:smoke` | Abre la web construida en un navegador y comprueba todas las páginas |
| `npm test` | Pruebas (parsers con páginas reales guardadas, base de datos y cálculos de la web) |
| `npm run typecheck` | Comprobación de tipos |
| `npm run build:site` | Actualización diaria: resultados, boxscores y plantillas de la temporada en curso, exportar y construir (`tools/actualizar.sh diaria`) |
| `npm run build:site:semanal` | La de los lunes: lo anterior + fichas, trayectorias, plantillas griegas, nombres legales FEB y auditoría |
| `node tools/site/selecciones.mjs` | Actualiza las medallas de la selección (Wikipedia) |

## Estructura

```
src/
  scraper/     descarga de cada liga (acb, feb, euroleague, fiba, europe/…) al modelo común (types.ts)
  db/          esquema (migrations.ts), escritura (writer.ts), consultas (queries.ts), fotos y colores (media.ts)
  cli/         línea de órdenes (npm run scrape -- …)
  shared/      identidad de cada liga (leagues.ts)
site/          web: páginas (pages/), piezas comunes (components/), datos y cálculos (lib/)
tools/site/    exportador, prueba de humo, medallas de la selección
tools/media/   fotos, escudos y colores (Python)
tests/         vitest + páginas reales guardadas (fixtures)
```

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

Base de datos: usa siempre `--db data/d3basket.db` (es la que leen el exportador de la web, `iniciar.bat` y la publicación diaria).


## Fotos, escudos y colores (`public/media`)

Las fotos de la FEB llegan de medio cuerpo o con fondo, y cada escudo tiene márgenes distintos. `tools/media` los deja todos como los de la ACB:

- **`faces.py`**: quita el fondo si lo hay (rembg, `u2net_human_seg`), detecta la cara (YuNet de OpenCV) y recorta con el encuadre de acb.com (cara al 50 % del ancho, ojos al 38,6 % del alto, 5:6) → `public/media/players/<ref>.webp`.
- **`logos.py`**: quita fondos lisos, recorta el margen vacío y centra cada escudo en 256×256 → `public/media/logos/<ref>.png`. De cada escudo saca los dos colores del club → `public/media/colors.json` (en la ACB se respeta el color oficial de acb.com).
- `src/db/media.ts` (`applyMedia`) aplica todo esto a la base de datos al exportar la web. Si falta algún fichero se usa el original.

```bash
pip install pillow numpy opencv-python-headless "rembg[cpu]"
python tools/media/logos.py                  # escudos y colores nuevos
python tools/media/faces.py --shard 0/3 &    # fotos nuevas (en paralelo: 0/3, 1/3, 2/3)
python tools/media/faces.py --recheck        # rehace las dudosas (restos de fondo, huecos)
# tools/media/players-skip.txt: jugadores sin foto en la FEB o sin cara; no se reintentan (salvo --force)
```

Solo procesa lo que falta; después hay que hacer commit de `public/media`. Los jugadores que lleguen después en el build diario usan la foto original de la FEB hasta la siguiente pasada.

- **`club_wiki.py`**: fundación e historia de los clubes FEB desde Wikipedia/Wikidata (solo acepta artículos cuyo elemento de Wikidata es un club de baloncesto español). Genera `tools/media/club-wiki.json` para revisarlo a mano (`"ok": false` descarta un emparejamiento) y se importa con `npm run scrape -- import-club-wiki tools/media/club-wiki.json`.

Los colores y logos de cada liga están en `src/shared/leagues.ts` y `public/media/leagues` (paleta de acb.com y logos oficiales de la FEB).


## Uso responsable de los datos

Los datos pertenecen a la ACB y a la FEB. El scraper hace peticiones secuenciales (1 por segundo), se identifica con su propio `User-Agent`, respeta `robots.txt` y solo lee páginas públicas. Está pensado para uso personal de análisis y scouting, no para redistribuir los datos.
