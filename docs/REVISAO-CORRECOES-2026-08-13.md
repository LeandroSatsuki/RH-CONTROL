# Revisão de correções — 13/08/2026

## Escopo revisado

- Consulta de colaboradores sem tela branca quando a API não retorna coleções opcionais.
- Rascunho automático do cadastro de colaborador e da nova movimentação.
- Dados bancários opcionais, atalhos PIX para CPF/CNPJ, telefone e e-mail e consulta de CNPJ.
- Benefício Cesta básica disponível no cadastro e na edição.
- Empresas mantidas dentro de Ajustes, sem item duplicado no menu lateral.
- Centro de Resultado, modalidade e cargos/funções sincronizados globalmente.
- Layout compacto das listas de Centro de Resultado e modalidades.
- Cálculo inclusivo de fim e horas para afastamento, atestado e férias.
- Alertas dinâmicos, sino com cinco itens, navegação para a ação corretiva e atualização manual.
- Auditoria carregada somente após filtro, limitada e com registro permanente de edição/exclusão de movimentação.
- Relatório Maker e persistência de modelos no formato aceito pela API.
- Inicialização automática do servidor validada após instalação/atualização.

## Proteção da base de produção

As migrations `20260813_0019` e `20260813_0020` são aditivas. A primeira preserva IDs e vínculos existentes, cria somente as cópias de catálogo ausentes e sincroniza os conteúdos. A segunda apenas cria a tabela de auditoria persistente. O atualizador continua exigindo backup validado antes de executar migrations e não recria a base existente.

## Validações executadas

- Backend: Ruff e 11 testes automatizados.
- Frontend: 7 testes automatizados e build de produção.
- Migrations: simulação partindo da revisão `20260803_0018`, com duas empresas e catálogos divergentes.
- Scripts do servidor: validação sintática de instalação, atualização e reparo.

## Validação antes da instalação no cliente

Executar a inspeção visual manual dos cadastros em resolução desktop e reduzida. Depois, gerar os instaladores em nova versão, testar a atualização sobre uma cópia restaurável da base e somente então aplicar no computador do cliente final.
