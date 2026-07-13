@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Project_GATE_Bridge.ps1" -Mode Status
endlocal
