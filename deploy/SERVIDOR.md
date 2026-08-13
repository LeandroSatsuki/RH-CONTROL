# Nexo Servidor

Este pacote deve ser instalado em apenas um computador Windows da empresa. Esse computador precisa permanecer ligado durante o uso do Nexo.

## Instalacao recomendada

Use `Nexo-Servidor-Setup-1.0.2.exe` como Administrador. O instalador baixa e configura automaticamente Python e PostgreSQL quando estiverem ausentes.

As instrucoes manuais abaixo sao mantidas como alternativa tecnica.

## Pre-requisitos

- Windows 10/11 ou Windows Server 2019+.
- IP fixo ou reserva de IP no roteador.
- Python 3.12+ com `Add Python to PATH`.
- PostgreSQL 16+ instalado e em execucao.
- Acesso de Administrador e internet durante a primeira instalacao.

## Instalar

1. Extraia o ZIP em uma pasta local do servidor.
2. Abra PowerShell como Administrador nessa pasta.
3. Execute:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\server-install.ps1
```

O instalador solicita a senha do usuario `postgres` e a senha inicial do administrador do Nexo. Depois ele:

- cria usuario e banco exclusivos;
- instala dependencias da API;
- aplica migrations e seed;
- registra a tarefa `Nexo API` para iniciar com o Windows;
- libera a porta TCP 8000 em redes privadas;
- registra o backup integral diário às 02:00;
- mostra o endereco que deve ser informado nos aplicativos clientes.

Quando o instalador detectar uma instalação anterior em `C:\Nexo`, ele aplica o fluxo de atualização e não recria o banco.

## Diagnostico

Para verificar o servidor sem digitar comandos, clique duas vezes em:

```text
C:\Nexo\scripts\server-status.bat
```

O Windows solicitará permissão de Administrador e manterá o resultado aberto na tela. Essa verificação é necessária somente antes/depois de uma atualização ou quando algum cliente não conseguir conectar.

Alternativa técnica pelo PowerShell:

```powershell
C:\Nexo\scripts\server-status.ps1
```

O diagnóstico informa a API, PostgreSQL, tarefa de backup e o último arquivo `.dump` disponível.

## Backup e restauração

Criar e validar um backup integral imediatamente:

```powershell
C:\Nexo\scripts\server-backup.ps1
```

Restaurar um backup, em PowerShell aberto como Administrador:

```powershell
C:\Nexo\scripts\server-restore.ps1 -BackupFile "C:\Nexo\backups\nexo_AAAAMMDD_HHMMSS.dump"
```

Antes de restaurar, o Nexo cria automaticamente uma cópia de segurança do estado atual. A restauração inclui todas as empresas, usuários, cadastros, históricos, benefícios, fechamentos, configurações, auditoria e modelos de relatório armazenados no banco.

## Atualizar o backend

Extraia o novo pacote do servidor e execute como Administrador:

```powershell
.\scripts\server-update.ps1
```

Toda atualização do servidor cria e valida um backup antes de aplicar arquivos ou migrations. Se o backup falhar, a atualização é cancelada sem alterar o banco.

## Clientes

Na tela de conexao do aplicativo, informe o endereco exibido pelo instalador, por exemplo:

```text
http://192.168.0.10:8000
```

O computador cliente e o servidor precisam estar na mesma rede da empresa.
