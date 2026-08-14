# Validação da release Nexo 1.0.6

## Escopo

- versão instalada visível permanentemente no cabeçalho;
- estados de verificação, disponibilidade, download, instalação e erro;
- progresso percentual e barra visual durante o download;
- ação manual para verificar novamente ou reiniciar e instalar;
- recuperação do estado atual mesmo quando o evento ocorreu antes da interface carregar.

## Proteção da produção

- não altera API, migrations ou estrutura do banco de dados;
- mantém a instalação automática somente para versões superiores;
- preserva a instalação do servidor, o arquivo `.env`, backups e dados existentes;
- mantém o atualizador do servidor com backup integral obrigatório.

## Entregáveis

- `Nexo-Servidor-Setup-1.0.6.exe`: primeira instalação ou reparo assistido;
- `Nexo-Servidor-Atualizador-1.0.6.exe`: atualização segura do servidor existente;
- `Nexo-Cliente-Setup-1.0.6.exe`: instalação manual do cliente;
- `Nexo-1.0.6.exe`, `.blockmap` e `latest.yml`: atualização automática do cliente;
- `Nexo-Servidor-1.0.6.zip`: pacote técnico do servidor.

## Atualização recomendada

Como esta versão não contém mudanças no backend, o servidor 1.0.5 continua compatível. Para manter os componentes identificados na mesma versão:

1. No servidor, execute `Nexo-Servidor-Atualizador-1.0.6.exe` como Administrador.
2. Execute `C:\Nexo\scripts\server-status.bat` e confirme PostgreSQL e API ativos.
3. Abra os clientes 1.0.5 e acompanhe a atualização automática pelo aviso existente.
4. Após a instalação, confirme no cabeçalho `v1.0.6 • atualizado`.

Não desinstale o PostgreSQL e não apague `C:\Nexo` durante a atualização.
