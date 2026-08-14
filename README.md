# Nexo

Sistema de controle de custos e pessoas com operação multiempresa, histórico por competência e acesso em rede local.

## Versão de produção

A versão `1.0.4` utiliza uma arquitetura cliente-servidor:

- **Servidor principal:** FastAPI, PostgreSQL, migrations, backup e API compartilhada.
- **Estações clientes:** aplicativo Windows Electron com frontend React.
- **Rede:** os clientes acessam o servidor pela porta TCP `8000` na rede privada.
- **Persistência:** os dados oficiais ficam somente no PostgreSQL do servidor.
- **Modo local/demo:** desativado na build de produção para impedir bases divergentes entre computadores.

O computador principal deve permanecer ligado durante o uso e ter IP fixo ou reserva de IP no roteador. A API não deve ser exposta diretamente à internet.

## Funcionalidades

- autenticação por usuário e senha, com perfis Administrador e Consultor;
- multiempresas, empresa principal, ativação/inativação e consulta pública de CNPJ;
- colaboradores por empresa, CPF/CNPJ validado, matrícula automática, endereço, contato, PIX e dados bancários;
- cargos/funções, modalidades e Centros de Resultado globais, com exclusão protegida quando houver vínculos;
- histórico salarial e movimentações auditáveis;
- contratos MEI com ações pendentes, edição antes da assinatura, anexo, renovação, download, auditoria e alertas;
- benefícios mensais, distribuição individual ou em lote e dependentes de plano de saúde;
- custo/folha por competência, CR e modalidade, com encargos e provisões configuráveis;
- fechamento mensal e bloqueios de pendências;
- indicadores alimentados por competências fechadas;
- relatórios operacionais e financeiros;
- Relatório Maker com modelos persistidos e filtros por competência;
- auditoria, alertas e configurações administrativas;
- backup integral agendado, validação, download e restauração;
- atualização do cliente pelo GitHub Releases e atualização segura do servidor com backup obrigatório.

## Instalação Windows

Os artefatos finais ficam em `entregas/`:

- `Nexo-Servidor-Setup-1.0.4.exe` para primeira instalação;
- `Nexo-Servidor-Atualizador-1.0.4.exe` para servidor já instalado;
- `Nexo-Cliente-Setup-1.0.4.exe` para instalação manual do cliente.

### Computador principal

1. Execute `Nexo-Servidor-Setup-1.0.4.exe` como Administrador na primeira instalação.
2. Informe uma senha para o PostgreSQL e uma senha inicial para o usuário `admin`.
3. Aguarde a confirmação de que banco, migrations, seed, API, firewall e backup foram configurados.
4. Execute também `Nexo-Cliente-Setup-1.0.4.exe` para usar o Nexo no computador principal.
5. Clique duas vezes no atalho de diagnóstico; ele solicitará permissão de Administrador:

```text
C:\Nexo\scripts\server-status.bat
```

O resultado deve mostrar `PostgreSQL 5432: True`, `API 8000: True` e `Saude da API: ok`.

### Outros computadores

1. Instale somente `Nexo-Cliente-Setup-1.0.4.exe`.
2. Na primeira abertura, informe o endereço privado mostrado pelo diagnóstico, por exemplo `http://192.168.0.10:8000`.
3. Entre com o usuário criado pelo Administrador.

`127.0.0.1` funciona apenas no próprio computador do servidor.

## Credencial inicial

- Usuário: `admin`
- Senha: definida durante a instalação do servidor

Troque e proteja essa senha após o primeiro acesso. A opção de lembrar senha usa a criptografia segura do Windows no aplicativo desktop; no navegador, apenas o nome do usuário é lembrado.

## Backup e recuperação

O instalador registra a tarefa `Nexo Backup Diario`, executada às `02:00`. Os arquivos ficam, por padrão, em `C:\Nexo\backups` e são gerados no formato customizado do PostgreSQL.

Criar um backup imediato:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Nexo\scripts\server-backup.ps1
```

Restaurar um backup, com o PowerShell aberto como Administrador:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Nexo\scripts\server-restore.ps1 -BackupFile "C:\Nexo\backups\nexo_AAAAMMDD_HHMMSS.dump"
```

O processo valida o arquivo e cria um backup de segurança antes da restauração. O backup contém todas as empresas e seus vínculos, usuários, colaboradores, históricos, benefícios, contratos, movimentos, competências, configurações, auditoria, faturamento e modelos de relatório.

Boas práticas:

1. Copie periodicamente os `.dump` para mídia externa ou armazenamento corporativo protegido.
2. Mantenha ao menos uma cópia fora do computador principal.
3. Teste a restauração trimestralmente em ambiente controlado.
4. Não renomeie arquivos `.partial`; eles representam backups incompletos.

## Atualizações

O cliente Electron consulta versões publicadas em GitHub Releases, baixa a nova versão em segundo plano e oferece a reinicialização. Se o usuário escolher “Depois”, a versão baixada será aplicada quando o Nexo for fechado.

Em um servidor já instalado, execute `Nexo-Servidor-Atualizador-1.0.4.exe` como Administrador. Esse entregável não faz instalação inicial: ele exige `C:\Nexo\.env`, cria e valida o backup, atualiza os arquivos, aplica migrations e só conclui depois que a API responder pela tarefa automática. Use `Nexo-Servidor-Setup-1.0.4.exe` apenas para uma máquina sem servidor ou para reparo assistido.

Antes de qualquer migration, `server-update.ps1` cria e valida um backup integral. Se isso falhar, a atualização é interrompida antes de modificar o banco.

Nunca desinstale PostgreSQL nem apague `C:\Nexo` para atualizar.

## Diagnóstico

```text
C:\Nexo\scripts\server-status.bat
```

O atalho mantém a janela aberta para leitura. Use-o antes/depois de atualizar ou quando algum cliente não conseguir conectar; não é necessário executá-lo diariamente.

O diagnóstico informa:

- estado da tarefa da API;
- porta e processo da API;
- conexão PostgreSQL;
- resposta dos endpoints de saúde e setup;
- tarefa e último arquivo de backup;
- endereços privados para configurar os clientes;
- logs recentes em `C:\Nexo\logs`.

## Desenvolvimento

Pré-requisitos: Python 3.12+, Node.js 20+ e PostgreSQL 16+ ou Docker Desktop.

```powershell
.\scripts\dev-start.ps1
```

Comandos separados:

```powershell
.\scripts\dev-db.ps1
.\scripts\dev-seed.ps1

cd backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check .

cd ..\frontend
npm.cmd test -- --run
npm.cmd run build
```

URLs locais:

- Frontend: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8000`
- Saúde: `http://127.0.0.1:8000/health`
- OpenAPI: `http://127.0.0.1:8000/docs`

## Empacotamento

```powershell
cd frontend
npm.cmd run desktop:build

cd ..
.\scripts\build-server-package.ps1 -Version 1.0.4
.\scripts\build-separated-installers.ps1 -Version 1.0.4
```

Antes da entrega, valide hashes e tamanhos:

```powershell
Get-FileHash .\entregas\Nexo-Servidor-Setup-1.0.4.exe -Algorithm SHA256
Get-FileHash .\entregas\Nexo-Servidor-Atualizador-1.0.4.exe -Algorithm SHA256
Get-FileHash .\entregas\Nexo-Cliente-Setup-1.0.4.exe -Algorithm SHA256
```

## Estrutura

```text
backend/        FastAPI, SQLAlchemy, Alembic, serviços e testes
frontend/       React, Vite, Electron e testes do modo de dados
installer/      definição NSIS do instalador do servidor
scripts/        desenvolvimento, instalação, atualização e recuperação
deploy/         instruções operacionais do servidor
entregas/       artefatos gerados, não versionados como fonte
```

## Segurança

- senhas são armazenadas por hash Argon2 no servidor;
- tokens JWT expiram conforme a configuração da API;
- rotas administrativas exigem perfil Administrador;
- segredos ficam em `.env`, que não deve ser versionado;
- senha lembrada no desktop é protegida pelo cofre criptográfico do Windows;
- CORS é restrito às origens configuradas;
- a porta `8000` é liberada apenas nos perfis de rede Domain/Private;
- backups contêm dados pessoais e devem ter acesso restrito;
- para acesso externo, use VPN ou proxy HTTPS administrado. Não publique a porta `8000` na internet.

## Estado de validação 1.0.0

- testes automatizados do backend e frontend aprovados;
- lint e build de produção aprovados;
- migrations aplicadas em PostgreSQL 16;
- backup real criado e validado com `pg_restore --list`;
- restauração real executada com contagens de todas as tabelas preservadas;
- ausência da API não ativa armazenamento local silenciosamente na produção;
- atualização do servidor protegida por backup obrigatório.

Consulte [deploy/SERVIDOR.md](deploy/SERVIDOR.md) para a operação técnica do computador principal.
