# Validação da release Nexo 1.0.11

Data: 15/09/2026

## Escopo

- pessoa única por CPF/CNPJ com histórico de vínculos sequenciais;
- transição de Freelancer para CLT e recontratação sem duplicar cadastro;
- movimentações associadas automaticamente ao vínculo vigente na data;
- folha proporcional por período e indicadores sem dupla contagem;
- compatibilidade dos lançamentos MEI com vínculos históricos válidos.

## Artefatos

- `Nexo-Cliente-Setup-1.0.11.exe`: instalação manual do cliente;
- `Nexo-1.0.11.exe`, `Nexo-1.0.11.exe.blockmap` e `latest.yml`: atualização automática do cliente;
- `Nexo-Servidor-Atualizador-1.0.11.exe`: atualização segura do servidor existente;
- `Nexo-Servidor-Setup-1.0.11.exe`: primeira instalação ou reparo assistido;
- `Nexo-Servidor-1.0.11.zip`: pacote técnico do servidor.

## Segurança

- nenhuma tabela ou coluna é removida;
- nenhuma migration de banco é necessária;
- a atualização do servidor exige a instalação existente e realiza backup preventivo validado;
- competências fechadas não aceitam transições;
- cadastros e históricos anteriores permanecem preservados.

## Validações obrigatórias

- testes e lint do backend;
- testes automatizados do frontend;
- build de produção e empacotamento Electron;
- geração dos instaladores separados;
- conferência dos hashes SHA-256;
- publicação do código, tag e artefatos no GitHub Releases.
