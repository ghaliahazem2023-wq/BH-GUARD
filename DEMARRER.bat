@echo off
title BH Guard - Demarrage complet
color 0A
echo.
echo  ============================================================
echo   BH Guard - Demarrage de tous les services
echo  ============================================================
echo.

REM ── 1. Spring Boot (port 8081) ────────────────────────────────────────────
echo [1/3] Demarrage Spring Boot (port 8081)...
start "BH Guard - Spring Boot" cmd /k "cd /d "%~dp0backend-bh-guard" && java -jar target\backend-bh-guard-0.0.1-SNAPSHOT.jar"
echo  -> Spring Boot demarre en arriere-plan
echo.

REM ── 2. FastAPI (port 8000) ────────────────────────────────────────────────
echo [2/3] Demarrage FastAPI / ARIA (port 8000)...
start "BH Guard - FastAPI" cmd /k "cd /d "%~dp0fastapi-backend" && call venv\Scripts\activate && python main.py"
echo  -> FastAPI demarre en arriere-plan
echo.

REM ── 3. Angular (port 4200) ────────────────────────────────────────────────
echo [3/3] Demarrage Angular (port 4200)...
echo  Attente de 8 secondes pour que les backends se lancent...
timeout /t 8 /nobreak >nul
start "BH Guard - Angular" cmd /k "cd /d "%~dp0bh-guard" && npm start"
echo.
echo  ============================================================
echo   Tous les services sont en cours de demarrage !
echo.
echo   Spring Boot : http://localhost:8081
echo   FastAPI     : http://localhost:8000
echo   Angular     : http://localhost:4200
echo  ============================================================
echo.
echo  L'application s'ouvrira automatiquement dans quelques secondes...
timeout /t 12 /nobreak >nul
start http://localhost:4200
echo.
pause
