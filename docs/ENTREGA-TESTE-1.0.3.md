# Entrega de teste Nexo 1.0.3

Build produzido a partir do commit `bd77272b2b9405914fb4131dab40ff510beefb16`.

## Arquivos para o teste

- `Nexo-Servidor-Atualizador-1.0.3.exe`: usar como Administrador no computador que já possui o servidor em `C:\Nexo`.
- `Nexo-Cliente-Setup-1.0.3.exe`: instalar nos computadores que executam o aplicativo cliente.
- `Nexo-Servidor-Setup-1.0.3.exe`: reservar para uma primeira instalação ou reparo assistido. Não usar no teste normal de atualização.
- `VERIFICAR-SERVIDOR.bat`: atalho de duplo clique para verificar o servidor antes e depois da atualização.

## Ordem segura no cliente

1. No servidor, clique duas vezes em `VERIFICAR-SERVIDOR.bat` e aceite a solicitação de Administrador.
2. Confirme `PostgreSQL 5432: True`, `API 8000: True` e `Saude da API: ok`.
3. Execute `Nexo-Servidor-Atualizador-1.0.3.exe` como Administrador.
4. Aguarde a mensagem de conclusão. O atualizador faz e valida um backup antes de alterar arquivos ou migrations.
5. Execute novamente `VERIFICAR-SERVIDOR.bat` e confirme a saúde da API.
6. Abra o cliente que já estava instalado e confirme que ele continua acessando a base existente.
7. Instale `Nexo-Cliente-Setup-1.0.3.exe` por cima do cliente atual e abra o Nexo.
8. Realize o checklist funcional abaixo.

## Checklist funcional

- Consultar um colaborador existente sem tela branca.
- Iniciar um novo colaborador, fechar o cadastro, abrir novamente e confirmar o rascunho.
- Conferir PIX por CPF/CNPJ e e-mail, dados bancários opcionais e Cesta básica.
- Alternar empresas e confirmar os mesmos Centros de Resultado, modalidades e cargos.
- Conferir alinhamento e botões dos catálogos.
- Criar uma movimentação de período e validar data final inclusiva e horas.
- Editar e excluir uma movimentação e confirmar os registros na Auditoria.
- Conferir alertas, sino, navegação para a ação e botão de atualização.
- Salvar e reabrir um modelo no Relatório Maker.
- Fechar e abrir o Nexo novamente, confirmando conexão normal com o servidor.

## Em caso de falha

Não desinstale PostgreSQL, não apague `C:\Nexo` e não execute restauração por conta própria. Preserve `C:\Nexo\logs\install.log`, `api.log` e `api-error.log`, anote a mensagem exibida e mantenha o backup criado pelo atualizador. O diagnóstico não precisa ser executado diariamente: use antes/depois de atualizações ou quando houver falha de conexão.

## Auto-update do cliente

Os assets `Nexo-1.0.3.exe`, `Nexo-1.0.3.exe.blockmap` e `latest.yml` foram gerados e validados. Eles ainda não foram publicados como GitHub Release, para impedir que máquinas em produção recebam a versão antes deste teste. Após a homologação, a Release poderá ser publicada e as próximas versões serão baixadas automaticamente pelo cliente.

## SHA-256

```text
234040F95D452277465CB1EE680ED0FFD91743E01FD458578859CD7F4C955C03  Nexo-Servidor-Setup-1.0.3.exe
17CE68FA2F10E737A62917E52D7D331F658FC8C74994F5B18C6EBFC5D82201BD  Nexo-Servidor-Atualizador-1.0.3.exe
064C4E7987F608F17D5F1858BDBAAEF0548D032CF97912468D4D0C03B498E8B5  Nexo-Cliente-Setup-1.0.3.exe
32E9D16CBAC0D1E61A116A34CF74FF0B1880CE69392B92536EBBC3C6A2EF54AA  Nexo-Servidor-1.0.3.zip
064C4E7987F608F17D5F1858BDBAAEF0548D032CF97912468D4D0C03B498E8B5  Nexo-1.0.3.exe
A6F3F5B184580FE719A2656B2F551E83E5014657AA5A6F69FB816C0C01C58D91  Nexo-1.0.3.exe.blockmap
F6C6EE9E89AD0D963F05EFE782102F396A1D97D697C46FD411166430396385D5  latest.yml
31F3B747796284973296DBC98B7BAE46FE74959120F8CF034E8F8E4E128672DB  Nexo-Entrega-Teste-1.0.3-PARA-CLIENTE-R2.zip
```

Os executáveis ainda não possuem certificado comercial Authenticode; o Windows SmartScreen pode solicitar confirmação manual.
