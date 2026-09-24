# Checklist das atualizações solicitadas em 24/09/2026

Base: v1.0.11, commit b073034. Implementação por dependências; publicação em etapa própria.

## Regras confirmadas

- Desligamento: último dia trabalhado é excluído da ausência; contar os dias úteis seguintes até o fim informado. Esses dias entram no absenteísmo. Dias ajustáveis e horas = dias × jornada do vínculo.
- Indicador IND: percentual = custo / faturamento; custo por KG = custo / produção em KG. Divisores zero não geram infinito.
- Não excluir custos históricos por causa do status atual do cadastro ou contrato.
- Contagem de admissões e efetivo dos indicadores considera apenas CLT.
- Um afastamento permanece um registro; cada competência usa apenas seu trecho.

## Correções dos fluxos existentes — implementação local

- [ ] 01 Supervisores disponíveis entre empresas.
- [ ] 02 Desligamento: dias úteis e recálculo automático das horas.
- [ ] 03 Admissões do Dashboard somente CLT.
- [ ] 04 Desligamentos originados da movimentação, com efeito consistente nas outras telas.
- [ ] 05 Custo histórico preservado após inativação.
- [ ] 06 Calendário acessível nos campos de data de movimentações.
- [ ] 07 Rateio dos afastamentos entre competências.
- [ ] 09 Renovação: contrato anterior Renovado, histórico financeiro preservado.
- [ ] 10 Consulta de contrato em modal.
- [ ] 11 Exclusão de contrato duplicado com auditoria e preservação financeira.
- [ ] 13 MEI em Salários, sem encargos/provisões.
- [ ] 15 Cabeçalho fixo durante rolagem.
- [ ] 17 Relatório Maker: corrigir envio de lista ao salvar modelo.
- [ ] 18a Relatórios: conciliar quantidades e custos com as fontes oficiais.
- [ ] 20 Afastamentos nos indicadores por competência.
- [ ] 21 Efetivo inicial e contratações CLT; horas não produtivas por competência.
- [ ] 22 Ocultar empresas inativas no seletor do cabeçalho.

## Ampliações — implementação local

- [ ] 08 Lançamentos Freelancer e importação de MEI/Freelancer com conferência.
- [ ] 12 Distrato MEI com data/documento e custos preservados no mês.
- [ ] 14 Lançamentos avulsos de ajuda de custo e hospedagem.
- [ ] 16 Plano odontológico em cadastro, benefícios, custos, relatórios e Maker.
- [ ] 18b Elegibilidade de salário-família e valor global por vigência, fora do custo/folha.
- [ ] 19 IND: faturamento, custo, percentual, meta editável, KG e custo/KG.

## Verificação e entrega

- [ ] Regressões dirigidas: desligamento em fim de mês, feriado/fim de semana, afastamento entre meses, inativação e transição Freelancer/CLT.
- [ ] Contratos: renovação, duplicidade, distrato e lançamentos anteriores.
- [ ] Importações: conferir elegibilidade, duplicidade, valores e retomada do rascunho.
- [ ] Conciliar Dashboard, Custo/Folha, indicadores, relatórios e exportações.
- [x] Compilação frontend, testes relevantes e lint backend (20 backend e 22 frontend).
- [ ] Documentação de atualização e compatibilidade cliente/servidor.

## Diagnóstico para evitar retrabalho

- O transporte HTTP acrescenta company_id ao corpo com spread de objeto, convertendo listas em objetos. Isso explica o erro do Maker: corrigir no transporte e testar o contrato HTTP.
- Dashboard usa somente vínculos ativos no fim do mês para somar custos; indicadores ainda filtram pelo status atual e usam jornada fixa de 22 dias.
- Movimentações são consultadas por competency exata; afastamentos que atravessam meses precisam de consulta por interseção e cálculo mensal compartilhado.
- Há cálculos independentes no backend, modo demonstrativo e relatórios. Centralizar as regras e conferir a equivalência antes de marcar itens concluídos.

## Estado de continuidade

Publicação 1.1.0 autorizada em 24/09/2026. Código e instaladores em preparação para GitHub Releases. Nenhum banco do cliente foi acessado ou migrado. Instruções: docs/RELEASE-1.1.0.md.

Os itens abaixo possuem implementação e verificações técnicas; ainda dependem da homologação operacional antes de publicação. As caixas do checklist representam aceite final, não apenas código escrito.

| Itens | Implementação / evidência |
| --- | --- |
| 01, 15, 22 | Supervisor pelo diretório global; cabeçalho fixo; seletor exclui empresas inativas. Compilação validada; conferência visual ainda necessária. |
| 02–07, 20–21 | Regras de competência compartilhadas; desligamento exclui último dia trabalhado, aceita ajuste de dias e recalcula horas; calendários; custo histórico; contagem CLT. Regressões em `test_competency.py`. |
| 08, 14 | Freelancer, Ajuda de custo e Hospedagem em lotes; modelo e importação XLSX MEI/Freelancer com conferência, rejeição de duplicidades e salvamento de linhas válidas como rascunho. Testes de API e parser. |
| 09–12 | Renovação assinada marca anterior Renovado; consulta modal; exclusão lógica com senha e Auditoria; distrato com documento; lotes confirmados e documentos preservados. Testes de API, migração e componente React. |
| 13 | MEI em Salários, compatibilidade com valores legados em pró-labore, sem encargos/provisões. Testes de API e modo local. |
| 16 | Plano odontológico em cadastros, transição, importação, benefícios, custo, indicadores, exportação e Maker. Teste API da distribuição e custo sem alteração indevida de encargos. |
| 17 | Transporte mantém listas JSON ao acrescentar empresa; três testes do contrato HTTP do Maker. |
| 18a | Retirados limites arbitrários de linhas; referências históricas por competência; totais filtrados no servidor; conciliação de custo entre Dashboard e relatórios. Revisão completa dos modelos existentes e comparação com dados reais permanecem pendentes. |
| 18b | Elegibilidade no colaborador e importação; valor global com vigências preservadas; transição mantém flag; salário-família não entra em custo. Teste de vigências e custo invariável. |
| 19 | IND: custo/faturamento, meta inicial 7% editável, KG manual e custo/KG. Salvamento explícito; teste de persistência e consolidação multiempresa de CRs iguais. |

### Próxima execução — evitar releituras e retrabalho

1. Conferir `git diff` e continuar a partir das alterações locais, sem reaplicar patches.
2. Homologar interface em tamanho de tela do cliente: modal de contratos, calendário, cabeçalho, importação com erros e salvamento de indicadores.
3. Comparar relatórios existentes com uma cópia anonimizada do banco real, incluindo salários reajustados, competências fechadas e vínculos antigos. Não afirmar que todos os modelos legados estão conciliados apenas com os testes sintéticos.
4. Migração validada em PostgreSQL 16 isolado até 20260924_0024. Backup restaurado com contagens iguais nas 19 tabelas do banco sintético. Validação com a base real permanece pendente.
5. Versão 1.1.0 definida para a publicação autorizada; concluir upload dos entregáveis e conferir o manifesto latest.yml no GitHub.

### Verificações executadas

- Backend: 20 testes aprovados, incluindo renovação/distrato/exclusão, custo histórico, rateio, lançamentos avulsos, odontológico, salário-família, filtros e consolidação multiempresa.
- Frontend: 22 testes aprovados na conferência final; build de produção aprovado. Repetir após qualquer ajuste subsequente.
- TypeScript: compilação aprovada. Build Vite aprovado com aviso de bundle maior que 500 kB, sem erro de compilação.
- Ruff: aprovado. `git diff --check`: sem problemas de whitespace; Git informa conversão LF/CRLF no Windows.

### Segurança da entrega

- Esta atualização exige servidor compatível: há colunas novas e novos endpoints. Quando a versão for publicada, atualizar servidor (backup antes) e depois clientes.
- Não remover banco, diretório de dados, documentos ou configurações ao atualizar.
- Exclusão de contratos é lógica: interrompe elegibilidade para novos lançamentos sem apagar os valores confirmados.
- Reversão operacional deve usar backup validado e versão compatível; não executar downgrade destrutivo em produção.
