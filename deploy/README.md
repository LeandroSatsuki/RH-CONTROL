# Preparação para instalação Windows

Esta pasta reserva os artefatos de implantação. O instalador ainda não faz parte deste marco.

Estrutura alvo:

- `C:\Nexo\backend`: API FastAPI e ambiente Python.
- `C:\Nexo\frontend`: build estático do React.
- `C:\Nexo\config`: arquivo `.env` protegido.
- `C:\Nexo\backups`: backups PostgreSQL.
- PostgreSQL instalado como serviço Windows no computador servidor.
- API instalada como serviço Windows e frontend servido pela API ou por serviço web local.

Antes do instalador, deve ser definido se PostgreSQL será instalado pelo pacote ou será um pré-requisito.

## Servidor persistente no Windows

A API não deve ser iniciada pelo instalador como um processo temporário. No computador servidor, abra o PowerShell como Administrador e execute:

```powershell
Set-Location C:\Nexo
.\scripts\install-server-service.ps1
```

O script:

- preserva o arquivo `.env`, a base PostgreSQL e os backups existentes;
- aplica somente migrations incrementais e o seed idempotente;
- registra a tarefa `NexoServer` para iniciar com o Windows, mesmo sem usuário conectado;
- executa a API em `0.0.0.0:8000` e reinicia o processo após falhas;
- grava o diagnóstico em `C:\Nexo\logs\server-service.log`.

O instalador oficial do servidor deve copiar os arquivos para `C:\Nexo` e executar esse script elevado como etapa final. Reinstalar o servidor não deve remover a tarefa, o `.env`, o PostgreSQL, a pasta de backups ou a base existente.
