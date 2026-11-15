@echo off
rem Abre las maquetas del nuevo d3 basket (no necesita Node).
cd /d "%~dp0"
where git >nul 2>nul && git pull --ff-only
start "" "%~dp0diseno\maquetas\index.html"
