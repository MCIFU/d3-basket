@echo off
rem D3 Basket en tu PC: descarga la ultima version y los datos del dia, monta la web y la abre.
rem Requisitos (una vez): Node.js LTS (https://nodejs.org) y Git (https://git-scm.com). Doble clic para ejecutar.
chcp 65001 >nul
cd /d "%~dp0"
title D3 Basket

where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo.
  pause
  exit /b 1
)

where git >nul 2>nul
if not errorlevel 1 (
  echo == Descargando la ultima version del proyecto...
  git pull --ff-only
)

if not exist node_modules (
  echo == Instalando dependencias ^(solo la primera vez, tarda unos minutos^)...
  call npm ci || goto :error
)

echo == Descargando los datos del dia...
if not exist public\data mkdir public\data
curl -fL --retry 3 -o public\data\d3basket.db.gz.tmp https://github.com/MCIFU/d3-basket/releases/download/datos/d3basket.db.gz
if errorlevel 1 (
  echo    No se han podido descargar: se usan los datos incluidos en el proyecto.
  del /q public\data\d3basket.db.gz.tmp 2>nul
  call npx tsx src/cli/index.ts restore-db --db data/d3basket.db || goto :error
  call npx tsx src/cli/index.ts export-web --db data/d3basket.db || goto :error
) else (
  move /y public\data\d3basket.db.gz.tmp public\data\d3basket.db.gz >nul
)

echo == Montando la web...
call npx vite build --config vite.web.config.ts --logLevel warn || goto :error

echo.
echo == D3 Basket abierto en http://localhost:4173  ^(cierra esta ventana para pararlo^)
call npx vite preview --config vite.web.config.ts --port 4173 --open
goto :eof

:error
echo.
echo Algo ha fallado. Copia el mensaje de arriba y pasamelo.
pause
exit /b 1
