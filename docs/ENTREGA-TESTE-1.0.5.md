# Entrega de teste Nexo 1.0.5

Build produzido a partir do commit `8922f7f8dd4e0d6a7d00a93cafa206829a4283b0`.

## O que mudou

- Administradores podem excluir colaboradores sem movimentações, contratos MEI, benefícios ou ajustes de folha vinculados.
- Administradores podem excluir empresas não principais que não possuem colaboradores, movimentações ou histórico operacional.
- A exclusão exige a senha do usuário conectado e uma confirmação final.
- Quando existe histórico, o sistema bloqueia a exclusão e orienta a inativação.
- Exclusões permitidas ficam registradas na Auditoria.

## Ordem segura para testar

Esta versão altera cliente e servidor. Portanto, atualize primeiro o servidor:

1. Execute `server-status.bat` no computador servidor.
2. Confirme `PostgreSQL 5432: True`, `API 8000: True` e `Saude da API: ok`.
3. Execute `Nexo-Servidor-Atualizador-1.0.5.exe` como Administrador.
4. Execute novamente `server-status.bat`.
5. Instale `Nexo-Cliente-Setup-1.0.5.exe` por cima do cliente atual.
6. Abra o Nexo e realize o checklist.

## Checklist funcional

- Criar um colaborador de teste sem movimentação e confirmar que o botão `Excluir` remove o cadastro após senha e confirmação.
- Informar uma senha errada e confirmar que a exclusão é recusada.
- Tentar excluir um colaborador que possui movimentação e confirmar que o sistema orienta a inativação.
- Criar uma empresa de teste vazia, sem marcá-la como principal, e confirmar sua exclusão.
- Tentar excluir a empresa principal e confirmar o bloqueio.
- Tentar excluir uma empresa com colaborador ou histórico e confirmar o bloqueio.
- Consultar a Auditoria e confirmar o registro das exclusões permitidas.

## Como funcionará a atualização automática

Depois da homologação e publicação da Release 1.0.5, os clientes consultarão o GitHub automaticamente ao iniciar, ao voltar para a janela e periodicamente. Quando a versão for baixada, o Nexo oferecerá reinicialização. Se o usuário escolher `Depois`, ela será instalada ao fechar o aplicativo.

Mudanças que incluem backend, como esta, continuam exigindo primeiro o `Nexo-Servidor-Atualizador-1.0.5.exe` no computador servidor. O auto-update atualiza somente o aplicativo cliente.

## Segurança

Não há migration nova nesta versão. A base existente não é apagada ou recriada. Mesmo assim, o atualizador cria e valida um backup antes de trocar os arquivos do servidor.

## SHA-256

```text
45884EE906E89B5FC998FBDF8B2F8A5F640DDE458165D4000CB27B8E91EC5CBE  Nexo-Servidor-Setup-1.0.5.exe
E109711F2AFDF4A434D96EE009D24FE97B0117BC48D20D721429CCC49D0E33E9  Nexo-Servidor-Atualizador-1.0.5.exe
405534DE9C6AD51FDC41F7A66037B2832ACE858FA8B844C8A7E12468649D9A57  Nexo-Cliente-Setup-1.0.5.exe
25B81D9B44D1F849B9666B4A2B6BC4B0BD3AD6385D20D686D70A404ED4487771  Nexo-Servidor-1.0.5.zip
405534DE9C6AD51FDC41F7A66037B2832ACE858FA8B844C8A7E12468649D9A57  Nexo-1.0.5.exe
F3BA281F177D28A08891A7331BC831B360BE2BEDD1ABC46C8D8102E41C4D63EB  Nexo-1.0.5.exe.blockmap
35BDB6816362112C485D77B5FA17BB7BC4F3D8F23BA0E177BC1EDF5E36B3D5A9  latest.yml
C34B095B53D72F78E01C6D7A70ECBE74AD8C106B83FA10FC2E0A0435D5A66B92  Nexo-Entrega-Teste-1.0.5-PARA-CLIENTE.zip
```

Os executáveis ainda não possuem certificado comercial Authenticode; o Windows SmartScreen pode solicitar confirmação manual.
