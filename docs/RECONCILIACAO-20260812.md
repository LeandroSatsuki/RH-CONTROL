# Reconciliacao do desenvolvimento original

Data: 2026-08-12

## Origem recuperada

- Fonte oficial recuperada: `E:\CONTROLE RH`.
- Snapshot anterior a qualquer operacao Git: `E:\NEXO_RECOVERY\pre-git-20260812-210635`.
- Branch publicada: `recovery/original-development-20260812`.
- Commit da recuperacao: `d3899f3348a2a41f9917a187aa75039449a063cb`.
- O ZIP oficial do servidor 1.0.1 apresentou 78 arquivos identicos a fonte recuperada e nenhuma divergencia.

## Migrations

- A cadeia Alembic permanece linear de `20260604_0001` ate `20260803_0018`.
- As migrations oficiais `0011` a `0018` foram preservadas sem alteracao.
- Nenhuma migration nova foi necessaria na integracao.
- Os metadados ORM de matricula e configuracao foram alinhados ao schema oficial; `alembic check` nao detecta operacoes pendentes.

## Integracao seletiva da PR 4

Os cinco commits de `agent/movement-resume-cnpj` foram analisados individualmente. Nao foi realizado merge automatico.

- `0b2948e`: retomada de movimentacoes, consulta CNPJ, PIX CPF/CNPJ e dados bancarios opcionais.
- `2efd926`: alertas corretivos, notificacoes e consulta filtrada da auditoria.
- `486faec`: cesta basica, retomada de tela, atualizacao manual e reforco de modelos.
- `f09c157`: o runner paralelo foi descartado; a persistencia foi adaptada as tarefas oficiais `Nexo API`.
- `60a396b`: interface compacta e bancada do Relatorio Maker, mantendo templates persistidos no backend.

## Conflitos resolvidos

- Cadastro de colaboradores: preservados empresa, mascara de documento, cargo rapido, ajuda de custo e importacao/exportacao.
- Dados bancarios: tornados opcionais sem remover normalizacao e busca por codigo bancario.
- PIX: mantidos atalhos para CPF/CNPJ e telefone.
- Alertas: habilitados para API real, sem recolocar bloqueio de modulo demo.
- Catalogos: preservados edicao, ativacao/inativacao e escopo da empresa com o layout compacto.
- Relatorio Maker: preservada persistencia PostgreSQL e busca de modelos; `localStorage` nao substitui a API.
- Servidor Windows: mantidos nomes, caminhos, instalador, atualizador, backup e diagnostico oficiais.

## Validacoes executadas

- Backend: 11 testes aprovados.
- Ruff: aprovado.
- Frontend: 7 testes aprovados.
- TypeScript e Vite: build aprovado.
- Alembic: uma cabeca em `20260803_0018`, banco local no head e sem operacoes pendentes.
- API local: `/health`, `/api/setup/status` e rotas criticas verificadas em `127.0.0.1:8011`.
- PowerShell 5.1: scripts oficiais de servidor validados pelo parser e configuracao de tarefa instanciada localmente.

## Riscos e pendencias antes de producao

- O bundle principal do frontend permanece acima de 500 kB; e um aviso de desempenho, nao falha de build.
- A tarefa Windows reforcada precisa de teste elevado em maquina virtual antes de gerar instaladores.
- Backup e restauracao devem ser ensaiados novamente sobre uma copia isolada da instalacao de producao.
- Nenhum instalador 1.0.2 foi gerado nesta reconciliacao.
- Nenhuma atualizacao foi aplicada ao computador ou banco do cliente.
- A PR de integracao deve permanecer em rascunho ate aprovacao explicita.
