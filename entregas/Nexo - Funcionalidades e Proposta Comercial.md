# Nexo - Funcionalidades e Proposta Comercial

## Visão geral

O **Nexo** é um sistema de controle de pessoas, custos e indicadores operacionais voltado para empresas que precisam acompanhar informações de folha, benefícios, contratos, movimentações e centros de resultado sem depender de planilhas manuais.

O foco do MVP não é gerar folha de pagamento completa. O objetivo é dar controle, visão gerencial, rastreabilidade e relatórios para apoiar decisões da área administrativa e financeira.

## Objetivo do MVP

Entregar uma plataforma inicial para consolidar informações de colaboradores, empresas, centros de resultado, benefícios, contratos MEI, custos e indicadores, com dados organizados por competência e filtros por empresa, modalidade, centro de resultado e colaborador.

## Valor proposto

**Investimento sugerido para fechamento do MVP: R$ 4.000,00**

Esse valor contempla a entrega inicial funcional do sistema, com estrutura pronta para evoluções futuras, demonstração desktop sem dependência técnica e base para implantação real com API e banco de dados.

## O que compõe o MVP

### 1. Multiempresas

- Cadastro e seleção de múltiplas empresas.
- Visão por empresa individual.
- Visão consolidada em "Todas as empresas".
- Configurações separadas por empresa.
- Base preparada para matriz, filial e empresas independentes.

### 2. Controle de colaboradores

- Cadastro de colaboradores.
- Validação de CPF/CNPJ.
- Bloqueio de documento duplicado.
- Matrícula gerada automaticamente por Centro de Resultado.
- Cadastro de cargo/função.
- Supervisor por lista suspensa.
- Endereço com CEP e preenchimento automático.
- Dados bancários.
- PIX obrigatório com validação por tipo.
- Benefícios marcados no cadastro.
- Status visual de ativo, inativo e afastado.
- Histórico salarial, férias, afastamentos e movimentações.

### 3. Centros de Resultado

- Cadastro de Centros de Resultado.
- Estrutura por ADM, IND, COM e DIR.
- Uso dos Centros de Resultado nos filtros, relatórios, colaboradores e custos.
- Cores visuais para facilitar leitura gerencial.

### 4. Modalidades de contratação

- Cadastro de modalidades como CLT, MEI, pró-labore, freelancer e outros.
- Separação dos custos por modalidade.
- Filtros em telas estratégicas.

### 5. Custo / Folha gerencial

- Tela de custo estruturada por colaborador e Centro de Resultado.
- Separação entre remunerações, benefícios, encargos, provisões e total geral.
- Campos editáveis em modo controlado.
- Subtotais e totais destacados.
- Filtros por competência, Centro de Resultado, modalidade e busca.
- Exportação para Excel.
- Distribuições de benefícios refletidas no custo.

### 6. Benefícios

- Lançamento de benefícios por competência.
- Filtros por benefício, modalidade, UF, Centro de Resultado e supervisor.
- Seleção de colaboradores elegíveis conforme cadastro.
- Distribuição em lote.
- Ajuste individual por colaborador.
- Dias trabalhados e valor por dia.
- Plano de saúde com dependente e valor de dependente.
- Exportação em Excel ou PDF ao confirmar.
- Registro para alimentar relatórios e custo/folha.

### 7. Fechamento mensal

- Estrutura de fechamento por competência.
- Alerta quando colaborador possui benefício marcado e não distribuído.
- Possibilidade de justificar pendências.
- Registro das justificativas em movimentações.

### 8. Contratos MEI

- Controle de contratos de MEI.
- Seleção de colaborador MEI cadastrado.
- Vigência inicial e final.
- Alerta de contrato não assinado.
- Anexo de contrato assinado.
- Status de contrato ativo.
- Alertas por prazo de vencimento.
- Registro em movimentações quando necessário.

### 9. Indicadores

- Tela de indicadores baseada na planilha de referência do cliente.
- Custo total com provisões.
- Indicadores operacionais.
- Custo sobre faturamento.
- Turnover.
- Absenteísmo.
- Comparação por Centro de Resultado.
- Gráficos e tabelas no layout de apresentação.
- Modo de exibição em popup.
- Apresentação geral dos relatórios em tela ampliada.

### 10. Relatórios financeiros e operacionais

- Relatórios por benefícios.
- Relatório de afastamentos.
- Relatórios financeiros.
- Filtros básicos no topo dos relatórios.
- Impressão com layout em linha, estilo planilha, sem grade pesada.
- Uso de logo da empresa nos relatórios.

### 11. Relatório Maker

- Montagem de relatórios personalizados.
- Escolha de fonte de dados.
- Seleção de colunas.
- Totais do relatório em construção.
- Filtros por período.
- Salvamento de múltiplos modelos.
- Busca de modelos salvos por texto.
- Reabertura de modelos respeitando o período filtrado.

### 12. Alertas e lembretes

- Tela específica para alertas.
- Lembretes como férias vencendo, retorno de afastamentos, contratos MEI e ajustes pendentes.
- Severidade visual por cor.
- Baixa, média e alta prioridade.

### 13. Auditoria e logs

- Tela para acompanhar alterações feitas no sistema.
- Registro de ações administrativas.
- Apoio para rastreabilidade e controle interno.

### 14. Ajustes do sistema

- Configurações gerais por empresa.
- Cadastro de cargos e funções.
- Cadastro de usuários.
- Centros de Resultado.
- Modalidades.
- Backup.
- Importação.
- Upload de logo da empresa.
- Área voltada para administradores.

### 15. Demo para apresentação

- Versão web demo sem API.
- Versão desktop Windows portable.
- Dados fictícios realistas.
- Login demo com administrador e consultor.
- Sem necessidade de PostgreSQL, backend ou migrations.

## Arquitetura técnica entregue

- Frontend React + Vite.
- Modo demo offline com dados locais.
- Empacotamento desktop com Electron.
- Backend FastAPI preservado para evolução real.
- Estrutura PostgreSQL prevista para produção.
- Scripts de desenvolvimento local.
- Estrutura modular por responsabilidades.

## Credenciais demo

- Administrador: `admin` / `admin`
- Consultor: `consultor` / `consultor`

Usuários adicionais podem ser cadastrados em **Ajustes do sistema > Usuários**.

## Escopo não incluído nesta proposta inicial

- Geração oficial de folha de pagamento.
- Integração bancária.
- eSocial.
- Cálculos legais completos de folha.
- Importação definitiva da planilha do cliente.
- Instalador Windows completo com serviço local.
- Hospedagem em servidor de produção.
- Integração com sistemas externos.
- Assinatura digital real de contratos.

Esses itens podem entrar como fases futuras após validação do MVP.

## Entregáveis sugeridos

- Sistema Nexo em versão demo.
- Aplicativo Windows portable.
- Código-base organizado.
- README com instruções.
- Documento de funcionalidades.
- Apresentação comercial.
- Repositório versionado.

## Argumento de valor para o cliente

O investimento de **R$ 4.000,00** não cobre apenas telas. Ele cobre a organização inicial de um produto de controle, com estrutura para multiempresas, histórico, rastreabilidade, filtros, relatórios, custos, benefícios e indicadores.

A principal entrega é substituir controles fragmentados em planilha por um sistema com visão gerencial, padronização dos processos e base pronta para evolução.

## Sugestão de fechamento

Proposta recomendada:

- Valor do MVP: **R$ 4.000,00**
- Entrega: versão demonstrável e base funcional inicial.
- Forma sugerida: 50% na aprovação e 50% na entrega validada.
- Evoluções futuras: orçadas por módulo ou pacote mensal.

