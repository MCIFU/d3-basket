@echo off
rem D3 Basket en local: monta la web con los datos de la semilla y la abre en el navegador.
rem Requisitos: Node.js 22 (https://nodejs.org) y Git. Doble clic para ejecutar.
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a ejecutar este archivo.
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

echo == Preparando los datos y la web...
call npx tsx src/cli/index.ts restore-db --db data/d3basket.db || goto :error
call npx tsx src/cli/index.ts export-web --db data/d3basket.db || goto :error
call npx vite build --config vite.web.config.ts || goto :error

echo.
echo == D3 Basket abierto en http://localhost:4173  ^(cierra esta ventana para pararlo^)
call npx vite preview --config vite.web.config.ts --port 4173 --open
goto :eof

:error
echo.
echo Algo ha fallado. Copia el mensaje de arriba y pasamelo.
pause
exit /b 1
