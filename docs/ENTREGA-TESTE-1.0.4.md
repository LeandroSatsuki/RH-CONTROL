# Entrega de teste Nexo 1.0.4

Build produzido a partir do commit `d86ffff66055322b3cb0dce16fa7b04bbc066fb7`.

## Arquivos para o teste

- `Nexo-Servidor-Atualizador-1.0.4.exe`: usar como Administrador no computador que já possui o servidor em `C:\Nexo`.
- `Nexo-Cliente-Setup-1.0.4.exe`: instalar nos computadores que executam o aplicativo cliente.
- `Nexo-Servidor-Setup-1.0.4.exe`: reservar para primeira instalação ou reparo assistido. Não usar na atualização normal.
- `VERIFICAR-SERVIDOR.bat`: atalho de duplo clique para verificar o servidor antes e depois da atualização.

## Ordem segura no cliente

1. No servidor, execute `VERIFICAR-SERVIDOR.bat` e aceite a solicitação de Administrador.
2. Confirme `PostgreSQL 5432: True`, `API 8000: True` e `Saude da API: ok`.
3. Execute `Nexo-Servidor-Atualizador-1.0.4.exe` como Administrador.
4. Aguarde a conclusão. O atualizador cria e valida um backup antes de trocar arquivos ou aplicar migrations.
5. Execute novamente `VERIFICAR-SERVIDOR.bat` e confirme a saúde da API.
6. Instale `Nexo-Cliente-Setup-1.0.4.exe` por cima do cliente atual.
7. Realize o checklist funcional abaixo.

## Checklist funcional

- Em Ajustes, conferir se Centro de Resultado e Modalidade exibem as ações na mesma linha do nome.
- Excluir um Centro de Resultado sem uso e confirmar a remoção em todas as empresas.
- Tentar excluir um Centro de Resultado usado e confirmar que o sistema bloqueia e explica o vínculo.
- Repetir os dois testes de exclusão com Modalidade.
- Em Contratos MEI, conferir os indicadores de ação necessária, ativos e próximos do vencimento.
- Abrir um contrato pendente, editar datas, anexar arquivo e concluir a assinatura.
- Confirmar que o alerta de contrato não assinado desaparece após a assinatura.
- Consultar e baixar um contrato assinado; confirmar que ele não pode ser alterado nem excluído.
- Renovar um contrato assinado e confirmar que o original permanece preservado e o novo fica pendente.
- Excluir um contrato pendente com confirmação por senha.
- Em uma máquina cliente, alternar telas e retornar ao Nexo depois de alguns minutos; confirmar atualização dos dados sem vários cliques em Atualizar.
- Fechar e reabrir o Nexo, confirmando conexão normal com o servidor.

## Segurança e banco de dados

Esta atualização não apaga nem recria a base existente. O atualizador do servidor preserva `C:\Nexo`, cria backup validado antes da troca e interrompe a atualização se o backup falhar. Não desinstale PostgreSQL e não apague `C:\Nexo`.

Contratos já assinados são imutáveis: correções posteriores são feitas por renovação, preservando o documento e a auditoria anteriores. Centros de Resultado e Modalidades só podem ser excluídos quando não existe colaborador vinculado.

## Em caso de falha

Preserve `C:\Nexo\logs\install.log`, `api.log` e `api-error.log`, anote a mensagem exibida e mantenha o backup criado pelo atualizador. Não execute restauração por conta própria.

## Auto-update do cliente

Os assets `Nexo-1.0.4.exe`, `Nexo-1.0.4.exe.blockmap` e `latest.yml` foram gerados, mas não publicados como GitHub Release. Assim, as máquinas de produção não recebem esta versão antes da homologação.

## SHA-256

```text
B22F4025362FE0C9232880A7A370664CC7E19B950BA80A5E20F63ED053B25118  Nexo-Servidor-Setup-1.0.4.exe
28C6354544E87950584BB4D65B0DB15A33CDD89C470E2C7CC1F70499285E21B2  Nexo-Servidor-Atualizador-1.0.4.exe
5CF1151D90CB29726D346B2AE11C87B1C1B410434E4E3BE144EE220A9D5BC75E  Nexo-Cliente-Setup-1.0.4.exe
CBD442B50A832512040E3485E2B1735241EFCA64FD7CA52D958FC41C9E4C20C8  Nexo-Servidor-1.0.4.zip
5CF1151D90CB29726D346B2AE11C87B1C1B410434E4E3BE144EE220A9D5BC75E  Nexo-1.0.4.exe
89A92CAF70AA1ADE5C3831E2A372EA5D80D6267614315E993ADFC2E6FE4BDFBF  Nexo-1.0.4.exe.blockmap
94505FB6082EC703B2BBD491F2F03925EEDF71D77B77311954C3FEB66A9B3505  latest.yml
F71466DCA824BE5A0671F01F2B859F53AE628799B9B5CB4EE27D973E5AB5D555  Nexo-Entrega-Teste-1.0.4-PARA-CLIENTE.zip
```

Os executáveis ainda não possuem certificado comercial Authenticode; o Windows SmartScreen pode solicitar confirmação manual.
