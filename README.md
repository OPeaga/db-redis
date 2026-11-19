# DistriCommerce Cache (`projeto-cache`)

Projeto acadêmico da disciplina de **Bancos de Dados NoSQL (UNIFOR)** demonstrando o paradigma **Cache de Chave-Valor (Key-Value Cache)** com **Redis 7.4** aplicado a uma loja virtual **Varejo & Atacado** derivada do domínio `DistriCommerce`.

## Entregáveis do Trabalho

- **Roteiro Completo da Apresentação**: [`docs/apresentacao.md`](docs/apresentacao.md) — cobre o funcionamento interno do Redis (`RAM-first`, Event Loop single-thread + `epoll`, `dict` com rehashing incremental, `redisObject`, expiração de TTL, eviction e RDB/AOF) e todos os 6 tópicos do edital.
- **Aplicação Prática Desacoplada**:
  - **Front-end enxuto (`http://localhost:5173`)**: Loja virtual **Varejo & Atacado** (`Vitrine`, `Carrinho` com validade automática e `Painel Admin`) sem jargão técnico nem painel lateral poluído.
  - **Terminal do backend (`npm.cmd run dev`) + `MONITOR` (`npm.cmd run redis:monitor`)**: exibe em tempo real e colorido cada comando Redis disparado pelas ações da loja (`HSET`, `HINCRBY`, `SET NX`, `HDEL`, `EXPIRE`, `DEL`, `SMEMBERS`).
  - **Redis Insight (`http://localhost:5540`)**: interface oficial da Redis (subida via `docker compose up -d` já pré-conectada em `DistriCommerce`) para inspecionar chaves, Hashes, Sets, TTL ao vivo e Profiler sem poluir o banco.
- **Documentação Arquitetural**: [`AGENTS.md`](AGENTS.md), [`GLOSSARY.md`](GLOSSARY.md), [`docs/adr/0001-modelagem-keyspace-redis-ecommerce.md`](docs/adr/0001-modelagem-keyspace-redis-ecommerce.md), [`docs/adr/0002-front-enxuto-com-terminal-e-redis-insight.md`](docs/adr/0002-front-enxuto-com-terminal-e-redis-insight.md) e o guia [`docs/guia-redis-para-quem-sabe-sql.md`](docs/guia-redis-para-quem-sabe-sql.md) (Redis explicado a partir de SQL).

## Modelagem no Redis (Keyspace)

| Chave | Estrutura | TTL | Papel |
|---|---|---|---|
| `produto:{id}` | `Hash` | — | Campos: `id`, `sku`, `nome`, `categoria`, `preco_varejo`, `preco_atacado`, `qt_atacado`, `estoque`, `atualizado_em`. |
| `catalogo:produtos` | `Set` | — | Índice primário dos IDs de produtos ativos (`SADD`, `SMEMBERS`, `SREM`). |
| `catalogo:sku:{sku}` | `String` | — | Trava de unicidade via `SET ... NX`. |
| `carrinho:{cliente_id}` | `Hash` | `1800s` na criação | Campos `item:{produto_id} -> quantidade`, permitindo `HINCRBY` e `HDEL` atômicos. Alterar itens preserva o TTL restante. |

## Pré-requisitos e Execução

> No Windows PowerShell onde scripts `.ps1` são bloqueados pela `ExecutionPolicy`, utilize `npm.cmd` e `npx.cmd`.

1. **Instalar dependências**:
   ```powershell
   npm.cmd install
   ```

2. **Subir o Redis 7.4 e o Redis Insight via Docker Compose**:
   ```powershell
   docker compose up -d
   ```
   Ou via atalho: `npm.cmd run redis:up`.
   - **Redis**: `localhost:6379`
   - **Redis Insight (UI)**: `http://localhost:5540` (pré-configurado com o banco `DistriCommerce`).
   *(Se o Docker não estiver ativo em desenvolvimento local, o backend realiza fallback automático para `ioredis-mock` em memória e indica o modo no log do terminal.)*

3. **Rodar Backend (Fastify `:3001`, com comandos no terminal) + Frontend (Vite `:5173`)**:
   ```powershell
   npm.cmd run dev
   ```
   Acesse a loja em `http://localhost:5173` e acompanhe os comandos Redis no terminal do backend (ou rode `npm.cmd run redis:monitor` em outro terminal para ver o `MONITOR` nativo do Redis).

## Testes, Build e Lint

```powershell
# Suíte completa (shared build + Vitest backend com ioredis-mock + Vitest frontend com MSW)
npm.cmd test

# Build completo de produção
npm.cmd run build

# ESLint (incluindo regras de fronteira entre features) + Prettier
npm.cmd run lint
```

## Roteiro Rápido do CRUD na Apresentação

1. **Consulta (`SMEMBERS` + `HGETALL` + `TTL`)**: abrir `http://localhost:5173` mostrando o catálogo inicial e `carrinho:cliente-demo` no **Redis Insight** (`http://localhost:5540`) e os comandos no terminal.
2. **Inserção (`SET NX` + `HSET` + `SADD`)**: cadastrar um novo produto no **Painel Admin** (`+ Novo produto`) e tentar repetir o mesmo SKU para demonstrar o erro `409 Conflict`.
3. **Atualização Completa (`PUT` -> `HSET`)**: editar os dados completos de um produto ou clicar em **Renovar (30m)** no carrinho (`EXPIRE 1800`).
4. **Alteração Parcial (`PATCH` -> `HINCRBY`)**: incrementar itens no carrinho até atingir `qt_atacado` (trocando automaticamente o preço unitário para **ATACADO**) ou ajustar o estoque em `-1`/`+1`.
5. **Exclusão (`HDEL` / `DEL` / `SREM`) e Expiração por TTL**: remover um item do carrinho, clicar em **Expirar em 10s** para observar a chave desaparecer automaticamente do Redis Insight após zerar o TTL, e excluir o produto de teste.
