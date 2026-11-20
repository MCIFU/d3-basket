#!/usr/bin/env bash
# Actualización de datos y web (la lanza GitHub Actions; no se ejecuta en el PC de nadie).
#
#   tools/actualizar.sh diaria    resultados, boxscores y plantillas de la temporada en curso (todas las ligas)
#   tools/actualizar.sh semanal   lo anterior + fichas de jugador renovadas, trayectorias, plantillas griegas,
#                                 nombres legales FEB y auditoría completa de la base de datos
#
# Un fallo en una liga no para el resto: se avisa y se publican los últimos datos buenos de esa liga.
set -u
MODO="${1:-diaria}"
DB=data/d3basket.db
cli() { npx tsx src/cli/index.ts "$@" --db "$DB"; }
paso() { echo; echo "════ $* ════"; }
aviso() { echo "::warning::$*"; }

if [ "$MODO" = semanal ]; then
  BIOS=1000   # fichas de jugador (FEB) por liga
  EDAD=7      # renovar fichas con más de 7 días
  CARRERAS=2000
else
  BIOS=150
  EDAD=30
  CARRERAS=250
fi

paso "Base de datos ($MODO)"
cli restore-db || exit 1

paso "España"
cli sync acb --delay 700 --player-max-age "$EDAD" --career-budget "$CARRERAS" || aviso "fallo al sincronizar la ACB"
for l in primera-feb segunda-feb tercera-feb; do
  cli sync "$l" --delay 400 --max-bios "$BIOS" --player-max-age "$EDAD" || aviso "fallo al sincronizar $l"
done
for l in copa-espana copa-rey supercopa; do
  cli sync "$l" --delay 400 || aviso "fallo al sincronizar $l"
done

paso "Europa y EE. UU."
for l in euroleague eurocup bcl lba serie-a2 bbl proa elite elite-2 bsl nba ncaa; do
  cli sync "$l" --delay 300 || aviso "fallo al sincronizar $l"
done
# Liga griega: las plantillas piden una página por jugador (≈15 min); a diario solo resultados.
if [ "$MODO" = semanal ]; then
  cli sync gbl --delay 300 || aviso "fallo al sincronizar gbl"
else
  cli sync gbl --delay 300 --no-rosters || aviso "fallo al sincronizar gbl"
fi
cli bsl-stats || aviso "fallo al leer la estadística de la liga turca"

paso "Mantenimiento"
cli clubs-oficiales || aviso "fallo al aplicar los nombres oficiales de los clubes"
cli canteras || aviso "fallo al colgar las canteras de sus clubes"
cli jugadores-duplicados || aviso "fallo al unir jugadores duplicados"
if [ "$MODO" = semanal ]; then
  cli careers-acb --delay 700 --career-budget "$CARRERAS" || aviso "fallo al descargar trayectorias acb.com"
  cli clubs-feb-legal --delay 400 || aviso "fallo al leer los nombres legales de la FEB"
  cli check || aviso "la auditoría ha encontrado errores (ver arriba)"
fi

paso "Web"
npx tsx src/cli/index.ts export-web --db "$DB" || exit 1
node --max-old-space-size=6144 --import tsx tools/site/export.ts --db "$DB" --out public/d || exit 1
npx vite build --config vite.site.config.ts || exit 1
