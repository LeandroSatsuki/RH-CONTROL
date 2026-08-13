Unicode true
RequestExecutionLevel admin

!ifndef APP_VERSION
  !define APP_VERSION "1.0.4"
!endif

!ifndef NSIS_RESOURCES
  !define NSIS_RESOURCES "C:\Users\lpsan\AppData\Local\electron-builder\Cache\nsis\nsis-resources-3.4.1-nsis-resources-3.4.1\plugins\x86-unicode"
!endif

!define PRODUCT_NAME "Nexo Atualizador do Servidor"

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

!addplugindir "${NSIS_RESOURCES}"

Name "${PRODUCT_NAME} ${APP_VERSION}"
OutFile "..\entregas\Nexo-Servidor-Atualizador-${APP_VERSION}.exe"
InstallDir "C:\Nexo"
BrandingText "Nexo - Atualização segura do servidor"
Icon "..\frontend\build\icon.ico"

!define MUI_ABORTWARNING
!define MUI_ICON "..\frontend\build\icon.ico"
!define MUI_WELCOMEPAGE_TITLE "Atualização do Nexo Servidor"
!define MUI_WELCOMEPAGE_TEXT "Este atualizador exige uma instalação existente em C:\Nexo.$\r$\n$\r$\nAntes de alterar o servidor, será criado e validado um backup integral. A base de dados, configurações, backups e logs existentes serão preservados."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Servidor Nexo atualizado"
!define MUI_FINISHPAGE_TEXT "A atualização foi concluída e a API respondeu pela tarefa automática.$\r$\n$\r$\nPara conferir, clique duas vezes em C:\Nexo\scripts\server-status.bat."
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "PortugueseBR"

Function .onInit
  SetRegView 64
  UserInfo::GetAccountType
  Pop $0
  ${If} $0 != "Admin"
    MessageBox MB_ICONSTOP "Execute o atualizador do servidor como Administrador."
    Quit
  ${EndIf}
  IfFileExists "C:\Nexo\.env" installation_found
    MessageBox MB_ICONSTOP "Nenhuma instalação do Nexo Servidor foi encontrada em C:\Nexo.$\r$\nUse o instalador completo do servidor para a primeira instalação."
    Quit
installation_found:
  IfFileExists "C:\Nexo\backend\.venv\Scripts\python.exe" updater_ready
    MessageBox MB_ICONSTOP "A instalação existente está incompleta: ambiente Python não encontrado.$\r$\nExecute C:\Nexo\scripts\repair-server-api.ps1 ou use o instalador completo."
    Quit
updater_ready:
FunctionEnd

Section "Atualizar Servidor"
  SetOutPath "$TEMP\NexoServerUpdater"
  File /oname=Nexo-Servidor.zip "payload\Nexo-Servidor-${APP_VERSION}.zip"

  DetailPrint "Extraindo pacote de atualização..."
  CreateDirectory "$TEMP\NexoServerUpdater\Servidor"
  nsisunz::UnzipToLog "$TEMP\NexoServerUpdater\Nexo-Servidor.zip" "$TEMP\NexoServerUpdater\Servidor"
  Pop $0
  ${If} $0 != "success"
    MessageBox MB_ICONSTOP "Não foi possível extrair o pacote de atualização: $0"
    Abort
  ${EndIf}

  DetailPrint "Executando backup, atualização, migrations e validação da API..."
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\NexoServerUpdater\Servidor\scripts\server-update.ps1"' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "A atualização foi interrompida com código $0.$\r$\n$\r$\nConsulte C:\Nexo\logs\install.log. A base não deve ser alterada manualmente antes do diagnóstico."
    Abort
  ${EndIf}

  RMDir /r "$TEMP\NexoServerUpdater"
SectionEnd
