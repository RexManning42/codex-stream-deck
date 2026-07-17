@echo off
title Start Codex Deck
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-CodexDeck.ps1"
if errorlevel 1 (
  echo.
  echo Codex Deck could not be started.
  pause
)
