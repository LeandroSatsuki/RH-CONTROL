# Validação da release Nexo 1.0.5

## Escopo

- exclusão protegida de colaboradores e empresas sem histórico vinculado;
- confirmação interna compatível com o aplicativo desktop;
- central de Lançamentos para MEI, cesta básica e premiação;
- rascunhos recuperáveis e confirmação auditável por competência;
- integração dos lançamentos ao Custo/Folha;
- rubricas próprias para premiação e cesta básica;
- elegibilidade MEI condicionada a contrato assinado e vigente;
- exclusão funcional de contratos pendentes;
- cards globais e consolidados no Dashboard.

## Proteção da produção

- a atualização do servidor exige instalação existente e backup integral validado;
- a migration `20260814_0021` apenas cria as tabelas de lotes e itens de lançamento;
- a base existente, o arquivo `.env`, backups e logs não são apagados;
- competências fechadas bloqueiam lançamentos;
- lotes confirmados são imutáveis e protegidos contra duplicidade;
- cadastros com histórico operacional não podem ser excluídos.

## Entregáveis

- `Nexo-Servidor-Setup-1.0.5.exe`: primeira instalação ou reparo assistido;
- `Nexo-Servidor-Atualizador-1.0.5.exe`: atualização segura do servidor existente;
- `Nexo-Cliente-Setup-1.0.5.exe`: instalação manual do cliente;
- `Nexo-1.0.5.exe`, `.blockmap` e `latest.yml`: atualização automática do cliente;
- `Nexo-Servidor-1.0.5.zip`: pacote técnico do servidor.

## Atualização recomendada

1. No servidor já instalado, execute `Nexo-Servidor-Atualizador-1.0.5.exe` como Administrador.
2. Aguarde a criação e validação do backup, migrations e resposta da API.
3. Execute `C:\Nexo\scripts\server-status.bat` e confirme PostgreSQL e API ativos.
4. Nos clientes, aguarde a atualização automática ou instale `Nexo-Cliente-Setup-1.0.5.exe` sobre a versão atual.

Não desinstale o PostgreSQL e não apague `C:\Nexo` durante a atualização.
