# Changelog

## 1.0.5 - 2026-08-14

### Exclusão segura de cadastros

- permite excluir colaboradores sem movimentações, contratos, benefícios ou ajustes de folha vinculados;
- permite excluir empresas não principais sem colaboradores, movimentos ou histórico operacional;
- exige senha de Administrador e confirmação antes da exclusão definitiva;
- registra a exclusão na Auditoria e orienta a inativação quando houver histórico a preservar.

## 1.0.1 - 2026-08-03

### Correção do servidor Windows

- corrige o encerramento imediato da API no PowerShell 5.1;
- separa os canais de log do Uvicorn sem interpretar mensagens INFO como erro fatal;
- mantém compatibilidade integral com o cliente Nexo 1.0.0 e com bancos já instalados.

## 1.0.0 - 2026-08-03

Primeira versão de produção do Nexo.

### Operação

- arquitetura servidor PostgreSQL/FastAPI com clientes Windows na rede local;
- modo local silencioso desativado na build oficial;
- competências operacionais dinâmicas, sem limitação ao ano de homologação;
- mensagens de erro e diagnóstico adequados ao ambiente do cliente;
- instaladores separados para servidor e cliente.

### Dados e segurança

- backup integral PostgreSQL validado antes da gravação definitiva;
- restauração com backup preventivo e reaplicação de migrations;
- backup diário agendado às 02:00;
- atualização do servidor bloqueada quando o backup preventivo falha;
- senha lembrada no desktop protegida pelo cofre criptográfico do Windows;
- persistência centralizada de modelos do Relatório Maker e faturamento dos indicadores.

### Funcionalidades oficializadas

- multiempresas e configuração por empresa;
- cadastros de colaboradores, cargos, Centros de Resultado e modalidades;
- movimentações, contratos MEI, benefícios e fechamento mensal;
- custo/folha com ajustes persistentes por competência;
- indicadores alimentados por competências fechadas;
- relatórios, Relatório Maker, alertas, auditoria e administração de usuários.

### Banco de dados

- migrations consolidadas até `20260803_0018`;
- histórico de salário e ajuda de custo explícita;
- dados públicos e definição de empresa principal;
- dados operacionais compartilhados e ajustes mensais de custo.
