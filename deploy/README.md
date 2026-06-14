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
