# Preparação para instalação Windows

Esta pasta reserva os artefatos de implantação. O instalador ainda não faz parte deste marco.

Estrutura alvo:

- `C:\SistemaIndicadoresFolha\backend`: API FastAPI e ambiente Python.
- `C:\SistemaIndicadoresFolha\frontend`: build estático do React.
- `C:\SistemaIndicadoresFolha\config`: arquivo `.env` protegido.
- `C:\SistemaIndicadoresFolha\backups`: backups PostgreSQL.
- PostgreSQL instalado como serviço Windows no computador servidor.
- API instalada como serviço Windows e frontend servido pela API ou por serviço web local.

Antes do instalador, deve ser definido se PostgreSQL será instalado pelo pacote ou será um pré-requisito.

