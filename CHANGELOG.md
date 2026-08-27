# Changelog

## 1.0.10 - 2026-08-27

### Importação assistida de colaboradores

- aceita a planilha mesmo quando algumas linhas possuem inconsistências;
- importa as linhas válidas sem ser interrompida pelas linhas que precisam de correção;
- informa linha, campo, valor encontrado, motivo e sugestão para cada inconsistência;
- continua o processamento quando o servidor rejeita uma linha isolada e apresenta a resposta no relatório;
- identifica documentos já cadastrados ou repetidos na planilha;
- interpreta valores monetários nos formatos numéricos mais comuns do Excel;
- unifica a validação da importação feita por Colaboradores e por Ajustes do sistema;
- não altera o servidor, as migrations ou a estrutura da base de dados.

## 1.0.9 - 2026-08-27

### Cadastro e importação de colaboradores

- trata acentos e caracteres especiais retornados pelas consultas automáticas de CNPJ e CEP sem bloquear o cadastro;
- preserva caracteres legítimos e normaliza textos incompatíveis antes de preencher o formulário;
- atualiza e unifica o modelo de importação disponível em Colaboradores e em Ajustes do sistema;
- inclui admissão, gratificação, ajuda de custo, observações, nome e código do banco, dígito da conta e demais informações atuais do cadastro;
- mantém os dados bancários opcionais durante a importação;
- não altera o servidor, as migrations ou a estrutura da base de dados.

## 1.0.8 - 2026-08-14

### Troca de empresa e matrículas

- adiciona carregamento visível e bloqueio temporário durante a troca de empresa;
- elimina consultas com o identificador anterior e descarta respostas atrasadas, evitando telas com valores zerados;
- atualiza automaticamente o prefixo e a sequência da matrícula quando o Centro de Resultado é alterado;
- mantém matrícula e Centro de Resultado sincronizados nos contratos MEI do modo local.

## 1.0.7 - 2026-08-14

### Cadastros e custo/folha

- corrige o cadastro de novos promotores em empresas secundárias com modalidades e Centros de Resultado globais;
- exibe a lista completa de cargos e funções ao editar um colaborador;
- adiciona gratificação ao cadastro do colaborador, cálculos, indicadores, relatórios e exportações;
- abre o Dashboard preferencialmente na competência atual e restaura seus valores consolidados;
- adiciona filtro opcional de supervisor aos lançamentos MEI.

### Operação e comunicação

- corrige a exclusão de movimentações com confirmação segura;
- adiciona chat privado entre usuários da rede com conversas e avisos de mensagens não lidas;
- inclui migrations compatíveis com a base existente, sem remoção de dados.

## 1.0.6 - 2026-08-14

### Visibilidade da atualização do cliente

- mostra permanentemente a versão instalada no cabeçalho;
- informa quando a verificação está em andamento ou quando o sistema já está atualizado;
- exibe a porcentagem e uma barra durante o download;
- destaca quando a nova versão está pronta para reiniciar e instalar;
- permite solicitar uma nova verificação diretamente pelo indicador de versão.

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
