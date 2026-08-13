# Validação de produção 1.0.0

Data: 03/08/2026

## Barreiras automatizadas

| Verificação | Resultado |
| --- | --- |
| Backend `pytest` | 11 testes aprovados |
| Backend `ruff` | sem ocorrências |
| Frontend `vitest` | 7 testes aprovados |
| TypeScript e Vite | build aprovado |
| Scripts PowerShell | 15 scripts analisados sem erro de sintaxe |
| FastAPI em PostgreSQL | saúde, setup e OpenAPI aprovados |
| Contratos OpenAPI | 42 rotas carregadas |
| Smoke autenticado | 23 módulos consultados com HTTP 200 |

## Backup e restauração

O fluxo foi executado contra PostgreSQL 16 real:

1. backup customizado criado com `pg_dump`;
2. arquivo validado por `pg_restore --list`;
3. SHA-256 calculado;
4. restauração integral executada;
5. migrations reaplicadas;
6. contagens antes e depois comparadas.

As contagens permaneceram idênticas para empresas, usuários, colaboradores, vínculos, modalidades, Centros de Resultado, históricos salariais, movimentos, benefícios, contratos MEI, fechamentos e configurações.

Último backup da barreira final:

- arquivo: `nexo_20260803_102911.dump`;
- entradas: `150`;
- tamanho: `56.633 bytes`;
- SHA-256: `cea0ecd599a0c6fbbbe7c36cfbe6fa54ba343609549e860c85d8053d4566e808`.

## Artefatos

| Arquivo | Tamanho | SHA-256 |
| --- | ---: | --- |
| `Nexo-Servidor-Setup-1.0.0.exe` | 337.964 bytes | `1F127E2BDA0E81790AFB68D4358CFBE34BD46207624675D3E35134DE8E283A08` |
| `Nexo-Cliente-Setup-1.0.0.exe` | 114.773.976 bytes | `21D74955C98AAAA9D4C1326612E7291B8C9124233F4D06629C8E0A2A61B0D6AC` |
| `Nexo-Servidor-1.0.0.zip` | 76.880 bytes | `CC0920BF64592DEB6508B497F8CED191826C63902E72896CEAC44D5D9F9C7F3D` |

O ZIP do servidor foi extraído em diretório temporário e teve os 79 arquivos conferidos, incluindo migrations, requirements e rotinas de backup, restauração, instalação e atualização.

O smoke autenticado percorreu login, sessão, empresas, colaboradores, Centros de Resultado, modalidades, usuários, backups, dashboard, movimentações, contratos MEI, catálogo e lançamentos de benefícios, custo/folha, indicadores, relatórios, fechamento, alertas, auditoria, ajustes, modelos do Relatório Maker e faturamento.

## Limites conhecidos

- os executáveis ainda não possuem certificado comercial de assinatura de código;
- a rede local usa HTTP; acesso externo exige VPN ou proxy HTTPS;
- o bundle principal do frontend gera apenas um aviso de tamanho, sem falha funcional;
- uma instalação limpa completa deve ser repetida na máquina definitiva ou em VM Windows limpa antes da entrada em operação.

## Correção do servidor 1.0.1

O instalador 1.0.0 revelou uma incompatibilidade específica do PowerShell 5.1: mensagens `INFO` que o Uvicorn envia para `stderr` eram convertidas em `NativeCommandError` e encerravam a API, embora o processo tivesse iniciado corretamente.

A versão 1.0.1 separa os canais de saída e não trata logs informativos como falha fatal. O lançador corrigido foi executado em porta isolada e respondeu:

- `/health`: `ok`;
- `/api/setup/status`: configurado;
- processo permaneceu ativo até o encerramento controlado do teste.

Artefato corrigido:

- arquivo: `Nexo-Servidor-Setup-1.0.1.exe`;
- tamanho: `338.139 bytes`;
- SHA-256: `C0FCCCBB8386BC5B136639A313FF2358888D705FF8FB8854788B7E0BD74D5655`.
