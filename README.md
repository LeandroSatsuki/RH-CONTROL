# Sistema de Indicadores de Folha

Primeiro marco funcional para substituir a planilha `Indicadores Folha 2026.xlsx`. A solução usa um servidor local com PostgreSQL e FastAPI; os demais computadores acessam o frontend pela rede interna.

## Arquitetura revisada

- **Servidor local:** PostgreSQL, API FastAPI e, futuramente, o build estático do React como serviços Windows.
- **Clientes da rede:** navegador apontando para o endereço do servidor. Nenhum banco é compartilhado por pasta.
- **Modelo relacional:** CPF identifica a pessoa; cada contratação é um vínculo separado, preservando histórico e permitindo recontratação futura.
- **Permissões:** Administrador altera dados; Consultor acessa consultas e dashboard.
- **Instalação futura:** estrutura alvo documentada em `deploy/README.md`, com pasta padrão `C:\SistemaIndicadoresFolha`.

## O que já funciona

- Assistente de configuração inicial.
- Login com JWT, senha com hash Argon2 e perfis Administrador/Consultor.
- Seed idempotente do administrador, modalidades e Centros de Resultado iniciais.
- Cadastro e consulta de Centros de Resultado, modalidades e colaboradores.
- Validação de CPF e bloqueio de CPF/matrícula duplicados.
- Dashboard mensal por Centro de Resultado, com admissões, desligamentos, efetivo e turnover.
- Estrutura isolada para indicadores, tratamento de erros Excel e divisão por zero.
- Backup manual inicial com `pg_dump` e retenção de 90 dias.
- Tema claro/escuro.
- Migration Alembic inicial.

## Pré-requisitos

- Python 3.12 ou superior.
- Node.js 20 ou superior.
- Docker Desktop recomendado para desenvolvimento local.
- PostgreSQL 16 ou superior, incluindo `pg_dump` no `PATH`, quando não usar Docker.

## Execução rápida no Windows

Na raiz do projeto:

```powershell
.\scripts\dev-start.ps1
```

Se o Windows bloquear scripts PowerShell, libere apenas a sessão atual e rode novamente:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\dev-start.ps1
```

Esse comando:

- cria `.env` a partir de `.env.example`, se necessário;
- verifica Python, Node.js e npm;
- usa Docker Compose para subir PostgreSQL quando Docker estiver disponível;
- instala dependências do backend e frontend quando necessário;
- aplica migrations;
- executa o seed inicial;
- inicia API e frontend.

URLs locais:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`
- Saúde: `http://127.0.0.1:8000/health`

Usuário inicial criado pelo seed:

- Usuário: `admin`
- Senha: `Admin@123`

Em uso real, altere `INITIAL_ADMIN_PASSWORD`, `POSTGRES_PASSWORD` e `SECRET_KEY` no `.env`.

### Quando Docker Não Estiver Instalado

O projeto continua usando PostgreSQL como banco padrão. Sem Docker, o script valida se existe PostgreSQL local em `127.0.0.1:5432`. Se não houver, ele para com instruções claras.

Opções:

1. Instale e abra o Docker Desktop, depois rode:

```powershell
.\scripts\dev-start.ps1
```

2. Ou instale PostgreSQL 16+, crie o banco/usuário conforme `.env` e rode:

```powershell
.\scripts\dev-db.ps1
.\scripts\dev-seed.ps1
.\scripts\dev-start.ps1
```

## Scripts de Desenvolvimento

Preparar apenas o banco:

```powershell
.\scripts\dev-db.ps1
```

Aplicar migrations e seed:

```powershell
.\scripts\dev-seed.ps1
```

Iniciar ambiente completo:

```powershell
.\scripts\dev-start.ps1
```

Os logs ficam em `logs/backend.log` e `logs/frontend.log`.

## Configuração Manual

Na raiz do projeto:

```powershell
Copy-Item .env.example .env
```

Troque `POSTGRES_PASSWORD`, `DATABASE_URL`, `SECRET_KEY` e `INITIAL_ADMIN_PASSWORD`.

### Banco com Docker

```powershell
docker compose up -d postgres
```

### Backend

```powershell
Set-Location backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m scripts.seed
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend

Em outro terminal:

```powershell
Set-Location frontend
npm.cmd install
npm.cmd run dev
```

Acesse `http://localhost:5173`. O frontend de desenvolvimento encaminha `/api` para `localhost:8000`.

Para testar a partir de outro computador, defina `VITE_API_URL=http://IP_DO_SERVIDOR:8000/api` antes do build e inclua a origem do frontend em `ALLOWED_ORIGINS`.

```powershell
$env:VITE_API_URL="http://192.168.0.10:8000/api"
npm.cmd run build
```

## Testes e qualidade

```powershell
Set-Location backend
.\.venv\Scripts\python.exe -m pytest
.\.venv\Scripts\python.exe -m ruff check .

Set-Location ..\frontend
npm.cmd run build
```

## Backup

O endpoint administrativo `POST /api/backups` executa `pg_dump`, salva um arquivo `.dump` e remove backups com mais de 90 dias. O executável `pg_dump` precisa estar no `PATH` do serviço da API. A pergunta automática ao abrir será ligada ao frontend em marco posterior.

## Segurança para uso real

- Use uma `SECRET_KEY` longa e aleatória e senhas diferentes das amostras.
- Restrinja a porta PostgreSQL ao servidor.
- Libere no firewall somente as portas da API/frontend necessárias à rede local.
- Para produção, execute API e frontend como serviços Windows e use HTTPS local quando possível.

Consulte [TODO.md](TODO.md) para o escopo ainda não implementado.

## Protótipo Demo para Cliente

O modo demo roda somente no frontend, com dados fictícios em memória. Ele não chama API real, não exige backend, PostgreSQL, migrations ou seed.

Credenciais demo:

- Administrador: `admin` / `admin`
- Consultor: `consultor` / `consultor`

### Rodar o Protótipo Localmente

```powershell
Set-Location frontend
npm.cmd install
npm.cmd run demo
```

Acesse `http://127.0.0.1:5173` ou a URL mostrada pelo Vite. A interface exibe uma indicação discreta de que os dados são fictícios.

Também é possível usar variável de ambiente manual:

```powershell
Set-Location frontend
$env:VITE_DEMO_MODE="true"
npm.cmd run dev
```

### Gerar Build Web Demo

```powershell
Set-Location frontend
npm.cmd run build:demo
```

O build final fica em:

```text
frontend/dist
```

Para validar localmente antes de enviar:

```powershell
Set-Location frontend
npx.cmd vite preview --host 127.0.0.1 --port 4173
```

### Publicar no Netlify

Use a pasta `frontend` como base do projeto.

- Build command: `npm run build:demo`
- Publish directory: `dist`
- Environment variable: `VITE_DEMO_MODE=true`

Se o deploy estiver configurado pela raiz do repositório, use:

- Base directory: `frontend`
- Publish directory: `frontend/dist`

### Publicar na Vercel

Use `frontend` como diretório do projeto.

- Framework preset: Vite
- Build command: `npm run build:demo`
- Output directory: `dist`
- Environment variable: `VITE_DEMO_MODE=true`

### Aplicativo Windows Demo

O desktop demo usa Electron e carrega a build estática local, sem backend.

Rodar em desenvolvimento:

```powershell
Set-Location frontend
npm.cmd run desktop:dev
```

Gerar versão portable para Windows:

```powershell
Set-Location frontend
npm.cmd run desktop:build
```

Arquivo final:

```text
frontend/release/Sistema-Indicadores-de-Folha-Demo-0.1.0-Portable.exe
```

Também fica disponível uma pasta descompactada para teste:

```text
frontend/release/win-unpacked/Sistema Indicadores de Folha - Demo.exe
```

Observação: se o ambiente tiver `ELECTRON_RUN_AS_NODE=1`, o script `desktop:dev` remove essa variável no launcher local. Para abrir manualmente o Electron, remova a variável antes.

## Roteiro de Apresentação ao Cliente

1. Login demo: entrar como `admin/admin` para mostrar o perfil Administrador; depois, se útil, entrar como `consultor/consultor` para demonstrar permissões de consulta.
2. Dashboard geral: apresentar o painel consolidado, cards por Centro de Resultado, alertas do mês, comparação com mês anterior e top 3 custos.
3. Detalhe por Centro de Resultado: clicar em “Ver detalhes” em ADM, IND, COM ou DIR para mostrar a leitura executiva.
4. Colaboradores: demonstrar busca, filtros por CR/modalidade/status, tabela completa e ficha lateral com histórico salarial, movimentações, férias, afastamentos e custo estimado.
5. Movimentações: selecionar competência, filtrar tipos e explicar como eventos mensais alimentam folha e indicadores.
6. Folha: mostrar resumo geral, resumo por CR, tabela por colaborador e modal “Detalhar custo”.
7. Indicadores: explicar efetivo, absenteísmo, turnover, custo total, salário per capita e fórmulas exibidas na tela.
8. Relatórios: abrir a prévia do relatório mensal e acionar exportar Excel/PDF/imprimir em modo demonstração.
9. Backup: mostrar status, lista de backups e simulação de geração/restauração.
10. Fechamento mensal: mostrar checklist, status da competência e permissões de fechar/reabrir apenas para Administrador.
11. Configurações: mostrar empresa, jornada, encargos, modalidades, permissões e backup.
12. Build: explicar que a demo pode ser entregue como site estático (`frontend/dist`) ou portable Windows (`frontend/release/Sistema-Indicadores-de-Folha-Demo-0.1.0-Portable.exe`).
