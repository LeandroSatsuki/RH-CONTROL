@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Nexo - Verificar servidor

fltmc >nul 2>&1
if errorlevel 1 (
    echo Solicitando permissao de Administrador...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "NEXO_STATUS_SCRIPT=%~dp0server-status.ps1"
if not exist "%NEXO_STATUS_SCRIPT%" set "NEXO_STATUS_SCRIPT=C:\Nexo\scripts\server-status.ps1"

echo.
echo Nexo - verificacao do servidor
echo ========================================

if not exist "%NEXO_STATUS_SCRIPT%" (
    echo ERRO: diagnostico nao encontrado em C:\Nexo\scripts\server-status.ps1
    echo Instale ou atualize o Nexo Servidor antes de tentar novamente.
    set "NEXO_EXIT_CODE=1"
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%NEXO_STATUS_SCRIPT%"
    set "NEXO_EXIT_CODE=!ERRORLEVEL!"
)

echo.
echo ========================================
if "%NEXO_EXIT_CODE%"=="0" (
    echo Verificacao concluida.
) else (
    echo A verificacao terminou com erro. Envie uma foto desta tela ao suporte.
)
echo.
pause
exit /b %NEXO_EXIT_CODE%
