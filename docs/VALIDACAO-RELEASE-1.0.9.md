# Validação da release Nexo 1.0.9

Data: 27/08/2026

## Escopo

- correção do tratamento dos textos retornados pelas consultas de CNPJ e CEP;
- atualização e unificação do modelo de importação de colaboradores;
- inclusão de todos os campos atualmente importáveis;
- entrega exclusiva do cliente, compatível com o servidor 1.0.8.

## Artefatos do cliente

- `Nexo-Cliente-Setup-1.0.9.exe`: instalação manual por cima da versão existente;
- `Nexo-1.0.9.exe`, `Nexo-1.0.9.exe.blockmap` e `latest.yml`: atualização automática.

## Segurança

- nenhuma migration foi adicionada;
- nenhuma alteração foi feita no backend ou no instalador do servidor;
- a base PostgreSQL existente não é removida nem modificada por esta atualização;
- o servidor 1.0.8 permanece compatível e não precisa ser reinstalado.

## Validações obrigatórias

- testes automatizados do frontend;
- build de produção e empacotamento Electron;
- testes e lint do backend para regressão;
- validação dos hashes SHA-256 dos artefatos publicados.
