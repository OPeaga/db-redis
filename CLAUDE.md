@AGENTS.md

# Notas Específicas do Ambiente (Claude / Ferramentas)

- **PowerShell no Windows**: A `ExecutionPolicy` desta máquina bloqueia `npm.ps1` e `npx.ps1`. Execute sempre `npm.cmd` e `npx.cmd` ao rodar comandos via shell.
- **Conexão Redis em desenvolvimento**: O backend espera o Redis em `REDIS_URL` (padrão `redis://127.0.0.1:6379`). Os testes automatizados usam `ioredis-mock` injetado via DI e nunca dependem de rede ou Docker ativo.
