# RH Control

<p align="center">
  Sistema de gestão de pessoas, folha e indicadores criado para substituir controles operacionais dispersos em planilhas.
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL_16-4169E1?style=flat-square&logo=postgresql&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white">
</p>

## Sobre o projeto

RH Control centraliza informações de colaboradores, vínculos e indicadores mensais em uma aplicação web preparada para uso em rede interna. O sistema nasceu da necessidade de evoluir uma planilha de indicadores de folha para uma solução com dados estruturados, histórico, permissões e regras consistentes.

Além do ambiente completo com API e banco de dados, o projeto oferece uma demonstração independente com dados fictícios. Isso permite apresentar os principais fluxos sem acessar informações reais ou preparar infraestrutura.

## Funcionalidades

- autenticação com JWT e senhas protegidas por hash;
- perfis de Administrador e Consultor;
- cadastro de empresas, centros de resultado e modalidades;
- gestão de colaboradores e vínculos empregatícios;
- validação de CPF e bloqueio de registros duplicados;
- histórico salarial e informações complementares do colaborador;
- dashboard mensal com admissões, desligamentos, efetivo e turnover;
- indicadores segmentados por centro de resultado;
- backup administrativo do PostgreSQL com política de retenção;
- tema claro e escuro;
- modo demonstrativo web e aplicativo portable para Windows.

## Arquitetura

```text
┌─────────────────────┐      HTTP/JSON      ┌─────────────────────┐
│ React + TypeScript  │ ──────────────────► │ FastAPI + SQLAlchemy│
└─────────────────────┘                     └──────────┬──────────┘
                                                     │
                                                     ▼
                                          ┌─────────────────────┐
                                          │    PostgreSQL 16    │
                                          └─────────────────────┘
```

| Diretório | Responsabilidade |
| --- | --- |
| `frontend/` | Interface React, modo demo e empacotamento Electron |
| `backend/app/` | API, autenticação, modelos e regras de negócio |
| `backend/alembic/` | Migrações do banco de dados |
| `backend/tests/` | Testes da API, CPF e indicadores |
| `scripts/` | Preparação e inicialização do ambiente no Windows |
| `deploy/` | Referência para instalação em rede interna |

## Executar a demonstração

A demonstração roda somente no frontend e utiliza dados fictícios em memória. Ela não acessa API, PostgreSQL ou dados reais.

```bash
cd frontend
npm install
npm run demo
```

Acesse `http://127.0.0.1:5173` e use uma das contas fictícias:

| Perfil | Usuário | Senha |
| --- | --- | --- |
| Administrador | `admin` | `admin` |
| Consultor | `consultor` | `consultor` |

Para gerar a versão web estática:

```bash
npm run build:demo
```

## Executar o ambiente completo

### Requisitos

- Python 3.12 ou superior;
- Node.js 20 ou superior;
- Docker Desktop ou PostgreSQL 16+;
- `pg_dump` disponível no `PATH` para backups.

Na raiz do projeto, copie as configurações de exemplo:

```powershell
Copy-Item .env.example .env
```

Troque todas as senhas e chaves antes de iniciar o sistema. Depois execute:

```powershell
.\scripts\dev-start.ps1
```

O script prepara o banco, instala as dependências necessárias, aplica as migrations, executa o seed e inicia frontend e backend.

Serviços locais:

- frontend: `http://127.0.0.1:5173`;
- API: `http://127.0.0.1:8000`;
- documentação OpenAPI: `http://127.0.0.1:8000/docs`;
- verificação de saúde: `http://127.0.0.1:8000/health`.

## Testes e qualidade

```powershell
Set-Location backend
python -m pytest
python -m ruff check .

Set-Location ..\frontend
npm run build
```

Os testes cobrem cálculos de indicadores, validação de CPF e o fluxo principal da API.

## Segurança

- o modo demo usa somente dados fictícios e não chama a API real;
- `.env`, backups, logs e artefatos de build são ignorados pelo Git;
- os valores padrão existentes são exclusivos para desenvolvimento local;
- em qualquer ambiente real, altere `SECRET_KEY`, credenciais do PostgreSQL e senha inicial;
- restrinja o banco ao servidor e exponha apenas os serviços necessários à rede;
- utilize HTTPS e uma política de backup testada antes de uso em produção.

## Estado atual

O projeto está em desenvolvimento. O cadastro base, a autenticação e parte dos indicadores já estão implementados; movimentações mensais, importação de folha, relatórios e fechamento de competências continuam no roadmap.

Consulte [TODO.md](./TODO.md) para acompanhar os próximos marcos e [deploy/README.md](./deploy/README.md) para a arquitetura de instalação planejada.

## Autor

Desenvolvido por [Leandro Santos](https://github.com/LeandroSatsuki).
