# Validação da release Nexo 1.0.10

Data: 27/08/2026

## Escopo

- importação parcial das linhas válidas da planilha de colaboradores;
- relatório detalhado das inconsistências, com sugestão de correção;
- continuidade do lote quando uma linha é rejeitada pelo servidor;
- validação única nos fluxos de Colaboradores e Ajustes do sistema;
- compatibilidade com valores monetários usuais do Excel;
- entrega exclusiva do cliente, compatível com o servidor 1.0.8.

## Artefatos do cliente

- `Nexo-Cliente-Setup-1.0.10.exe`: instalação manual sobre a versão existente;
- `Nexo-1.0.10.exe`, `Nexo-1.0.10.exe.blockmap` e `latest.yml`: atualização automática.

## Segurança

- linhas inconsistentes não são gravadas parcialmente;
- falha em uma linha não interrompe as demais linhas válidas;
- documentos duplicados são bloqueados antes do envio;
- nenhuma migration ou alteração de backend foi adicionada;
- a base PostgreSQL existente não é removida nem alterada;
- o servidor 1.0.8 permanece compatível e não precisa ser reinstalado.

## Validações obrigatórias

- testes automatizados do frontend;
- build de produção e empacotamento Electron;
- testes e lint do backend para regressão;
- conferência dos hashes SHA-256 dos artefatos publicados.
