# Entrega de teste Nexo 1.0.3

Build produzido a partir do commit `a8a9e26d4347b6d9c8cfa54e93cbf5fa9294475e`.

## Arquivos para o teste

- `Nexo-Servidor-Atualizador-1.0.3.exe`: usar como Administrador no computador que já possui o servidor em `C:\Nexo`.
- `Nexo-Cliente-Setup-1.0.3.exe`: instalar nos computadores que executam o aplicativo cliente.
- `Nexo-Servidor-Setup-1.0.3.exe`: reservar para uma primeira instalação ou reparo assistido. Não usar no teste normal de atualização.

## Ordem segura no cliente

1. No servidor, abra PowerShell como Administrador e execute `C:\Nexo\scripts\server-status.ps1`.
2. Confirme `PostgreSQL 5432: True`, `API 8000: True` e `Saude da API: ok`.
3. Execute `Nexo-Servidor-Atualizador-1.0.3.exe` como Administrador.
4. Aguarde a mensagem de conclusão. O atualizador faz e valida um backup antes de alterar arquivos ou migrations.
5. Execute novamente `server-status.ps1` e confirme a saúde da API.
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

Não desinstale PostgreSQL, não apague `C:\Nexo` e não execute restauração por conta própria. Preserve `C:\Nexo\logs\install.log`, `api.log` e `api-error.log`, anote a mensagem exibida e mantenha o backup criado pelo atualizador.

## Auto-update do cliente

Os assets `Nexo-1.0.3.exe`, `Nexo-1.0.3.exe.blockmap` e `latest.yml` foram gerados e validados. Eles ainda não foram publicados como GitHub Release, para impedir que máquinas em produção recebam a versão antes deste teste. Após a homologação, a Release poderá ser publicada e as próximas versões serão baixadas automaticamente pelo cliente.

## SHA-256

```text
43202BE0EE94B0FA2E07793F7349953F5A7C3770CA18D5108085E7DE6982DB2D  Nexo-Servidor-Setup-1.0.3.exe
B22EBEAA98F66AC553498E18DEE697CA7D3A1A48E270E2358463219EF5A10C23  Nexo-Servidor-Atualizador-1.0.3.exe
064C4E7987F608F17D5F1858BDBAAEF0548D032CF97912468D4D0C03B498E8B5  Nexo-Cliente-Setup-1.0.3.exe
EEA126D451DC3424E1BC8386DACF177D99F736F81D9B08FC21CB6C382637230F  Nexo-Servidor-1.0.3.zip
064C4E7987F608F17D5F1858BDBAAEF0548D032CF97912468D4D0C03B498E8B5  Nexo-1.0.3.exe
A6F3F5B184580FE719A2656B2F551E83E5014657AA5A6F69FB816C0C01C58D91  Nexo-1.0.3.exe.blockmap
F6C6EE9E89AD0D963F05EFE782102F396A1D97D697C46FD411166430396385D5  latest.yml
467DCB7F3FEC495C72A8712BAE56A8B108B301574AA246B092804580C0540290  Nexo-Entrega-Teste-1.0.3-PARA-CLIENTE.zip
```

Os executáveis ainda não possuem certificado comercial Authenticode; o Windows SmartScreen pode solicitar confirmação manual.
