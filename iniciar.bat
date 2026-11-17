@echo off
rem d3 basket en tu PC: descarga la ultima version y los datos del dia, monta la web y la abre.
rem Requisitos (una vez): Node.js LTS (https://nodejs.org) y Git (https://git-scm.com). Doble clic para ejecutar.
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title d3 basket

where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo.
  pause
  exit /b 1
)

rem Si se descarga una version nueva de este archivo, se vuelve a lanzar ya actualizado.
if "%~1"=="actualizado" goto :seguir
where git >nul 2>nul
if not errorlevel 1 (
  echo == Descargando la ultima version del proyecto...
  for /f %%i in ('git rev-parse HEAD') do set ANTES=%%i
  git pull --ff-only
  for /f %%i in ('git rev-parse HEAD') do set DESPUES=%%i
  if not "!ANTES!"=="!DESPUES!" (
    call "%~f0" actualizado
    exit /b
  )
)
:seguir

echo == Comprobando dependencias...
call npm install --no-audit --no-fund --loglevel=error || goto :error

echo == Descargando los datos del dia...
if not exist data mkdir data
curl -fL --retry 3 -o data\d3basket.db.gz https://github.com/MCIFU/d3-basket/releases/download/datos/d3basket.db.gz
if errorlevel 1 (
  echo    No se han podido descargar: se usan los datos incluidos en el proyecto.
  call npx tsx src/cli/index.ts restore-db --db data/d3basket.db || goto :error
) else (
  node tools/site/unzip-db.mjs data\d3basket.db.gz data\d3basket.db || goto :error
)
rem Si la semilla del proyecto es mas nueva que los datos publicados (p. ej. justo tras cargar ligas nuevas), se usa la semilla.
call npx tsx src/cli/index.ts restore-db --db data/d3basket.db || goto :error

echo == Preparando los datos de la web ^(unos 30 segundos^)...
call npx tsx tools/site/export.ts --db data/d3basket.db --out public/d || goto :error

echo == Montando la web...
call npx vite build --config vite.site.config.ts --logLevel warn || goto :error

echo.
echo == d3 basket abierto en http://localhost:4173  ^(cierra esta ventana para pararlo^)
echo    Si dice que el puerto 4173 esta ocupado, cierra las otras ventanas negras de d3 basket y vuelve a abrir este archivo.
call npx vite preview --config vite.site.config.ts --port 4173 --strictPort --open
goto :eof

:error
echo.
echo Algo ha fallado. Copia el mensaje de arriba y pasamelo.
pause
exit /b 1
