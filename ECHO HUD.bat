@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden kur, sonra tekrar dene.
  pause
  exit /b 1
)
echo ECHO HUD aciliyor.
echo Bu pencereyi kapatirsan program durur.
node src\main.js
if errorlevel 1 pause