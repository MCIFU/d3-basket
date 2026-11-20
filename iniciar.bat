@echo off
rem d3 basket en tu PC. Solo descarga y rehace lo que haya cambiado:
rem   - el proyecto: git pull (solo baja las diferencias)
rem   - dependencias: solo si cambia package-lock.json
rem   - datos del dia: solo si en GitHub hay unos mas nuevos que los tuyos
rem   - exportar y construir la web: solo si cambiaron los datos o el codigo
rem Requisitos (una vez): Node.js LTS (https://nodejs.org) y Git (https://git-scm.com).
chcp 65001 >nul
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title d3 basket

where node >nul 2>nul
if errorlevel 1 (
  echo Falta Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a abrir este archivo.
  if not "%D3_OCULTO%"=="1" pause
  exit /b 1
)

rem Si se descarga una version nueva de este archivo, se vuelve a lanzar ya actualizado.
if "%~1"=="actualizado" goto :seguir
where git >nul 2>nul
if not errorlevel 1 (
  echo == Buscando cambios del proyecto...
  for /f %%i in ('git rev-parse HEAD') do set ANTES=%%i
  git pull --ff-only
  if errorlevel 1 echo    AVISO: no se ha podido actualizar el proyecto ^(hay cambios locales?^). Se sigue con la version actual.
  for /f %%i in ('git rev-parse HEAD') do set DESPUES=%%i
  if not "!ANTES!"=="!DESPUES!" (
    call "%~f0" actualizado
    exit /b
  )
)
:seguir
if not exist data mkdir data
for /f %%i in ('git rev-parse HEAD 2^>nul') do set VERSION=%%i

rem ── Dependencias: solo si cambia package-lock.json ──
set LOCK=
for /f "usebackq delims=" %%h in (`certutil -hashfile package-lock.json SHA256 ^| findstr /v ":"`) do if not defined LOCK set LOCK=%%h
set LOCK_OK=
if exist node_modules\.d3-lock (set /p LOCK_OK=<node_modules\.d3-lock)
if not exist node_modules (set LOCK_OK=)
if not "!LOCK!"=="!LOCK_OK!" (
  echo == Instalando dependencias ^(solo cuando cambian^)...
  call npm install --no-audit --no-fund --loglevel=error || goto :error
  > node_modules\.d3-lock echo !LOCK!
)

rem ── Datos del dia: solo si GitHub tiene unos mas nuevos que el archivo local ──
set DATOS_ANTES=
if exist data\d3basket.db.gz for %%A in (data\d3basket.db.gz) do set DATOS_ANTES=%%~tA%%~zA
echo == Comprobando si hay datos nuevos...
if exist data\d3basket.db.gz (
  curl -fsSL --retry 3 -z data\d3basket.db.gz -R -o data\d3basket.db.gz https://github.com/MCIFU/d3-basket/releases/download/datos/d3basket.db.gz
) else (
  curl -fSL --retry 3 -R -o data\d3basket.db.gz https://github.com/MCIFU/d3-basket/releases/download/datos/d3basket.db.gz
)
set DATOS_DESPUES=
if exist data\d3basket.db.gz for %%A in (data\d3basket.db.gz) do set DATOS_DESPUES=%%~tA%%~zA

set REHACER=
if not "!DATOS_ANTES!"=="!DATOS_DESPUES!" set REHACER=1
if not exist data\d3basket.db set REHACER=1
if not exist public\d\meta.json set REHACER=1
set HECHO=
if exist data\.d3-version (set /p HECHO=<data\.d3-version)
if not "!HECHO!"=="!VERSION!" set REHACER=1

if defined REHACER (
  echo == Preparando los datos...
  if exist data\d3basket.db.gz (
    node tools/site/unzip-db.mjs data\d3basket.db.gz data\d3basket.db || goto :error
  )
  rem Si la semilla del proyecto es mas nueva que los datos publicados, se usa la semilla.
  call npx tsx src/cli/index.ts restore-db --db data/d3basket.db || goto :error
  call node --max-old-space-size=6144 --import tsx tools/site/export.ts --db data/d3basket.db --out public/d || goto :error
  echo == Montando la web...
  call npx vite build --config vite.site.config.ts --logLevel warn || goto :error
  > data\.d3-version echo !VERSION!
) else (
  echo == Sin cambios: se abre la web tal cual.
)
if not exist dist-site\index.html (
  call npx vite build --config vite.site.config.ts --logLevel warn || goto :error
)

echo.
echo == d3 basket abierto en http://localhost:4173  ^(cierra esta ventana para pararlo^)
echo    Si dice que el puerto 4173 esta ocupado, cierra las otras ventanas negras de d3 basket y vuelve a abrir este archivo.
call npx vite preview --config vite.site.config.ts --port 4173 --strictPort --open
goto :eof

:error
echo.
echo Algo ha fallado. Copia el mensaje de arriba y pasamelo.
if not "%D3_OCULTO%"=="1" pause
exit /b 1
