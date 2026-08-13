# Validacao da release 1.0.2

Data: 2026-08-12

Branch: `integration/production-reconcile`

Commit de codigo empacotado: `737764bc72ab39e8a2edb1474a2f86c336a8b524`

## Artefatos

| Arquivo | Tamanho (bytes) | SHA-256 |
| --- | ---: | --- |
| `Nexo-Cliente-Setup-1.0.2.exe` | 114778402 | `0D79A87362A07B024A700FFF31DB0FCEB02D64EF7B47CE58E09421B8A0813782` |
| `Nexo-Servidor-Setup-1.0.2.exe` | 338939 | `D618D202DB0861C44449E03ADC73A8B9C91551CEF3EEE4BF8E964024A988A61D` |
| `Nexo-Servidor-1.0.2.zip` | 77880 | `BE512C0856F885FF9913A20D1E18A9474A4D4DC7F79BE16BBBA98264CD2491F1` |

O instalador do Servidor incorpora o ZIP. O ZIP separado e destinado a suporte tecnico e nao precisa ser entregue junto com o EXE.

## Validacoes executadas

- Backend: 11 testes aprovados.
- Frontend: 7 testes aprovados.
- Ruff: aprovado.
- TypeScript e Vite: build aprovado.
- Electron Builder e NSIS: builds aprovados.
- Alembic: head `20260803_0018`, sem operacoes novas detectadas.
- Backup PostgreSQL: criado e reconhecido pelo `pg_restore`, com 150 objetos restauraveis.
- Pacote do Servidor: 18 migrations e nenhum `.env`, banco, backup, log, `.venv` ou cache.
- Scripts PowerShell: analise sintatica aprovada.

## Preservacao na atualizacao

Ao detectar uma instalacao existente, o instalador executa `server-update.ps1`. Esse fluxo:

1. importa a configuracao existente de `C:\Nexo\.env`;
2. cria e valida um backup PostgreSQL antes de alterar a aplicacao;
3. cancela a atualizacao se o backup falhar;
4. preserva o `.env`, o banco PostgreSQL, a pasta de backups e os logs;
5. copia somente backend e scripts;
6. aplica migrations incrementais ate a `0018`;
7. reinicia e valida `/health` e `/api/setup/status`.

O ensaio de restauracao em banco temporario nao foi concluido porque o usuario PostgreSQL local nao possui a permissao `CREATEDB`. Nenhuma permissao foi elevada e a base existente nao foi alterada.

## Risco conhecido

Os executaveis nao possuem certificado comercial Authenticode. O Windows pode exibir um aviso do SmartScreen. Os hashes acima devem ser usados para conferir a integridade dos arquivos antes da instalacao.

Os instaladores nao foram executados nesta maquina de desenvolvimento. A instalacao completa deve ser ensaiada em maquina virtual Windows antes de qualquer atualizacao do ambiente do cliente.
