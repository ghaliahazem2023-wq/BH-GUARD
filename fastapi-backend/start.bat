@echo off
title BH Guard - FastAPI Backend
color 0A
echo.
echo  ============================================
echo   BH Guard - Demarrage FastAPI (port 8000)
echo  ============================================
echo.

REM ── Vérifier Python ──────────────────────────────────────────────────────
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python n'est pas installe !
    echo.
    echo  Installe Python 3.11 depuis : https://www.python.org/downloads/
    echo  Coche bien "Add Python to PATH" pendant l'installation.
    echo.
    pause
    exit /b 1
)

echo [OK] Python detecte :
python --version
echo.

REM ── Créer venv si absent ─────────────────────────────────────────────────
if not exist "venv\" (
    echo [1/3] Creation de l'environnement virtuel...
    python -m venv venv
    echo.
)

REM ── Activer venv ─────────────────────────────────────────────────────────
call venv\Scripts\activate.bat

REM ── Installer les dépendances ─────────────────────────────────────────────
echo [2/3] Installation des dependances...
pip install -r requirements.txt --quiet
echo.

REM ── Charger .env si présent ───────────────────────────────────────────────
if exist ".env" (
    echo [3/3] Chargement des variables depuis .env...
    for /f "usebackq tokens=1* delims==" %%A in (`findstr /v "^#" .env`) do (
        if not "%%A"=="" set "%%A=%%B"
    )
) else (
    echo [3/3] Pas de fichier .env - ARIA fonctionne sans Mistral
)
echo.

REM ── Démarrer FastAPI ──────────────────────────────────────────────────────
echo  Demarrage sur http://localhost:8000
echo  Documentation : http://localhost:8000/docs
echo  Appuie sur Ctrl+C pour arreter
echo.
python main.py

pause
