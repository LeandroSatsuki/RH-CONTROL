Unicode true
RequestExecutionLevel admin

!ifndef APP_VERSION
  !define APP_VERSION "1.0.5"
!endif

!define PRODUCT_NAME "Nexo Servidor"
!define PYTHON_URL "https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe"
!define POSTGRES_URL "https://get.enterprisedb.com/postgresql/postgresql-16.11-1-windows-x64.exe"
!ifndef NSIS_RESOURCES
  !define NSIS_RESOURCES "C:\Users\lpsan\AppData\Local\electron-builder\Cache\nsis\nsis-resources-3.4.1-nsis-resources-3.4.1\plugins\x86-unicode"
!endif

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"
!include "x64.nsh"

!addplugindir "${NSIS_RESOURCES}"

Name "${PRODUCT_NAME} ${APP_VERSION}"
OutFile "..\entregas\Nexo-Servidor-Setup-${APP_VERSION}.exe"
InstallDir "C:\Nexo"
BrandingText "Nexo - Servidor"
Icon "..\frontend\build\icon.ico"

Var PostgresPasswordField
Var AdminPasswordField
Var PostgresPassword
Var AdminPassword
Var PythonPath
Var DownloadResult
Var IsUpgrade

!define MUI_ABORTWARNING
!define MUI_ICON "..\frontend\build\icon.ico"
!define MUI_WELCOMEPAGE_TITLE "Instalação do Nexo Servidor"
!define MUI_WELCOMEPAGE_TEXT "Este assistente instala ou atualiza somente o servidor do Nexo.$\r$\n$\r$\nUse este instalador no computador principal, onde ficarão banco de dados, API e serviços locais."

!insertmacro MUI_PAGE_WELCOME
Page custom ServerPageCreate ServerPageLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "Nexo Servidor pronto"
!define MUI_FINISHPAGE_TEXT "A instalação do servidor foi concluída. Clique duas vezes em C:\Nexo\scripts\server-status.bat para ver os endereços que os clientes devem usar."
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "PortugueseBR"

Function .onInit
  SetRegView 64
  UserInfo::GetAccountType
  Pop $0
  ${If} $0 != "Admin"
    MessageBox MB_ICONSTOP "O Nexo Servidor precisa ser executado como Administrador.$\r$\nClique com o botão direito no arquivo e escolha Executar como administrador."
    Quit
  ${EndIf}
  StrCpy $IsUpgrade "0"
  IfFileExists "C:\Nexo\.env" 0 done_upgrade_check
  IfFileExists "C:\Nexo\scripts\server-update.ps1" 0 done_upgrade_check
    StrCpy $IsUpgrade "1"
done_upgrade_check:
FunctionEnd

Function ServerPageCreate
  ${If} $IsUpgrade == "1"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 28u "Configuração inicial do servidor"
  Pop $0
  CreateFont $1 "Segoe UI" 11 700
  SendMessage $0 ${WM_SETFONT} $1 1

  ${NSD_CreateLabel} 0 42u 100% 14u "Senha do administrador PostgreSQL (postgres)"
  Pop $0
  ${NSD_CreatePassword} 0 60u 100% 24u ""
  Pop $PostgresPasswordField

  ${NSD_CreateLabel} 0 96u 100% 14u "Senha inicial do usuário admin do Nexo"
  Pop $0
  ${NSD_CreatePassword} 0 114u 100% 24u ""
  Pop $AdminPasswordField

  ${NSD_CreateLabel} 0 150u 100% 42u "Use no mínimo 8 caracteres. Em atualizações futuras esta tela será pulada para preservar o banco já configurado."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function ServerPageLeave
  ${NSD_GetText} $PostgresPasswordField $PostgresPassword
  ${NSD_GetText} $AdminPasswordField $AdminPassword
  StrLen $0 $PostgresPassword
  ${If} $0 < 8
    MessageBox MB_ICONEXCLAMATION "A senha do PostgreSQL deve ter pelo menos 8 caracteres."
    Abort
  ${EndIf}
  StrLen $0 $AdminPassword
  ${If} $0 < 8
    MessageBox MB_ICONEXCLAMATION "A senha do administrador do Nexo deve ter pelo menos 8 caracteres."
    Abort
  ${EndIf}
FunctionEnd

Function DownloadFile
  Exch $1
  Exch
  Exch $0
  DetailPrint "Baixando $1..."
  inetc::get /CAPTION "Nexo Servidor" /CONNECTTIMEOUT 30 /RECEIVETIMEOUT 120 "$0" "$TEMP\NexoServerSetup\$1" /END
  Pop $DownloadResult
  ${If} $DownloadResult != "OK"
    MessageBox MB_ICONSTOP "Não foi possível baixar $1.$\r$\n$DownloadResult$\r$\nVerifique a internet e tente novamente."
    Abort
  ${EndIf}
  Pop $0
  Pop $1
FunctionEnd

Function EnsurePython
  StrCpy $PythonPath "$PROGRAMFILES64\Python312\python.exe"
  IfFileExists "$PythonPath" python_ready
  StrCpy $PythonPath "$LOCALAPPDATA\Programs\Python\Python312\python.exe"
  IfFileExists "$PythonPath" python_ready

  Push "${PYTHON_URL}"
  Push "python-installer.exe"
  Call DownloadFile
  DetailPrint "Instalando Python 3.12..."
  ExecWait '"$TEMP\NexoServerSetup\python-installer.exe" /quiet InstallAllUsers=1 PrependPath=1 Include_test=0' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "A instalação do Python falhou. Código: $0"
    Abort
  ${EndIf}
  StrCpy $PythonPath "$PROGRAMFILES64\Python312\python.exe"
  IfFileExists "$PythonPath" python_ready
  MessageBox MB_ICONSTOP "Python foi instalado, mas o executável não foi encontrado."
  Abort

python_ready:
  DetailPrint "Python encontrado em $PythonPath"
FunctionEnd

Function EnsurePostgres
  IfFileExists "$PROGRAMFILES64\PostgreSQL\16\bin\psql.exe" postgres_ready

  Push "${POSTGRES_URL}"
  Push "postgresql-installer.exe"
  Call DownloadFile
  DetailPrint "Instalando PostgreSQL 16..."
  ExecWait '"$TEMP\NexoServerSetup\postgresql-installer.exe" --mode unattended --unattendedmodeui minimal --superpassword "$PostgresPassword" --serverport 5432' $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "A instalação do PostgreSQL falhou. Código: $0"
    Abort
  ${EndIf}
  IfFileExists "$PROGRAMFILES64\PostgreSQL\16\bin\psql.exe" postgres_ready
  MessageBox MB_ICONSTOP "PostgreSQL foi instalado, mas o psql não foi encontrado."
  Abort

postgres_ready:
  DetailPrint "PostgreSQL 16 encontrado."
FunctionEnd

Section "Instalar Servidor"
  SetOutPath "$TEMP\NexoServerSetup"
  File /oname=Nexo-Servidor.zip "payload\Nexo-Servidor-${APP_VERSION}.zip"

  DetailPrint "Extraindo componentes do servidor..."
  CreateDirectory "$TEMP\NexoServerSetup\Servidor"
  nsisunz::UnzipToLog "$TEMP\NexoServerSetup\Nexo-Servidor.zip" "$TEMP\NexoServerSetup\Servidor"
  Pop $0
  ${If} $0 != "success"
    MessageBox MB_ICONSTOP "Não foi possível extrair os componentes do servidor: $0"
    Abort
  ${EndIf}

  ${If} $IsUpgrade == "1"
    DetailPrint "Atualização detectada. Aplicando patch do servidor..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\NexoServerSetup\Servidor\scripts\server-update.ps1"' $0
  ${Else}
    Call EnsurePython
    Call EnsurePostgres
    System::Call 'Kernel32::SetEnvironmentVariable(t "NEXO_POSTGRES_ADMIN_PASSWORD", t "$PostgresPassword") i .r0'
    System::Call 'Kernel32::SetEnvironmentVariable(t "NEXO_INITIAL_ADMIN_PASSWORD", t "$AdminPassword") i .r0'
    System::Call 'Kernel32::SetEnvironmentVariable(t "NEXO_PYTHON_EXECUTABLE", t "$PythonPath") i .r0'
    DetailPrint "Configurando banco, API, firewall e inicialização automática..."
    ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$TEMP\NexoServerSetup\Servidor\scripts\server-install.ps1"' $0
    System::Call 'Kernel32::SetEnvironmentVariable(t "NEXO_POSTGRES_ADMIN_PASSWORD", p 0) i .r1'
    System::Call 'Kernel32::SetEnvironmentVariable(t "NEXO_INITIAL_ADMIN_PASSWORD", p 0) i .r1'
    System::Call 'Kernel32::SetEnvironmentVariable(t "NEXO_PYTHON_EXECUTABLE", p 0) i .r1'
  ${EndIf}

  ${If} $0 != 0
    MessageBox MB_ICONSTOP "A configuração do servidor falhou. Código: $0$\r$\nConsulte:$\r$\nC:\Nexo\logs\install.log$\r$\nou$\r$\n$TEMP\Nexo-server-install.log"
    Abort
  ${EndIf}

  RMDir /r "$TEMP\NexoServerSetup"
SectionEnd
