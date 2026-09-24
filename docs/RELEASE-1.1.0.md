# Nexo 1.1.0

## Atualização obrigatória do servidor antes do cliente

1. Reserve uma janela de manutenção e feche o Nexo nas estações.
2. No computador do cliente final que hospeda o servidor, execute **Nexo-Servidor-Atualizador-1.1.0.exe** como Administrador.
3. Aguarde backup validado, migração e inicialização da API. Não feche o atualizador durante o processo.
4. Execute `C:\Nexo\scripts\server-status.bat` e confira banco, API e saúde `ok`.
5. Abra o Nexo nas estações conectadas à internet. O cliente buscará a atualização no GitHub e mostrará o progresso; reinicie quando solicitado. Alternativa manual: `Nexo-Cliente-Setup-1.1.0.exe`.

O aplicativo atualiza apenas o cliente. O servidor precisa do atualizador próprio. Não aplique apenas o cliente desta versão em um servidor antigo.

## Alterações

- Cálculos por competência, rateio de afastamentos entre meses e desligamento contado a partir do dia seguinte ao último dia trabalhado.
- Custos históricos preservados após inativação; contagens CLT e consolidação multiempresa corrigidas.
- Contratos MEI em janela de consulta, renovação com histórico, distrato com documento e exclusão lógica auditada.
- Lançamentos de Freelancer, Ajuda de custo e Hospedagem; importação XLSX de MEI/Freelancer com conferência e rascunho.
- Valores MEI em Salários, sem encargos/provisões; compatibilidade com lançamentos legados em pró-labore.
- Plano odontológico integrado a cadastro, benefícios, custos e relatórios.
- Salário-família: elegibilidade por colaborador e valor global por vigência, fora do Custo/Folha.
- IND: custo/faturamento, meta inicial de 7% editável, produção em KG e custo/KG.
- Correção do salvamento de modelos do Maker; relatórios sem truncamento arbitrário e com totais filtrados.
- Supervisores entre empresas, calendário nas movimentações, cabeçalho fixo e empresas inativas ocultas no seletor.

## Preservação de dados

- O atualizador usa o banco existente, cria e valida backup antes de migrar e não executa instalação inicial do PostgreSQL.
- A migração `20260924_0024` adiciona colunas. Não remove tabelas, cadastros ou documentos.
- Contratos anteriores com sucessor único, assinado e de vigência imediatamente seguinte são identificados como renovados. Documentos e lançamentos confirmados são mantidos.
- Não desinstale PostgreSQL nem apague `C:\Nexo`, `.env`, backups ou documentos.
- Se houver falha, não repita instalações nem altere a base manualmente: preserve o backup e consulte `C:\Nexo\logs\install.log`.

## Validação e limites

- Testes automatizados: 20 backend e 22 frontend; build de produção e Ruff aprovados na etapa de implementação.
- Revalidados na release: 20 testes backend e 22 frontend aprovados; cliente Windows NSIS gerado. Migração até 20260924_0024 aplicada em PostgreSQL 16 isolado, backup validado e restaurado em outro banco temporário com contagens iguais nas 19 tabelas. Nenhuma conexão ao banco do cliente.
- A publicação foi autorizada pelo responsável. Homologação completa das telas e comparação de todos os modelos de relatório com o banco real continuam pendentes.
- Faça a conferência operacional após a atualização e antes de retomar lançamentos em lote. O aviso de tamanho do bundle no build não impede o empacotamento.
