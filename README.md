# DistriCommerce Cache (`projeto-cache`)

Projeto acadêmico da disciplina de **Bancos de Dados NoSQL (UNIFOR)** demonstrando o paradigma **Cache de Chave-Valor (Key-Value Cache)** com **Redis 7.4** aplicado a uma loja virtual **Varejo & Atacado** derivada do domínio `DistriCommerce`.

## Entregáveis do Trabalho

- **Roteiro Completo da Apresentação**: [`docs/apresentacao.md`](docs/apresentacao.md) — cobre o funcionamento interno do Redis (`RAM-first`, Event Loop single-thread + `epoll`, `dict` com rehashing incremental, `redisObject`, expiração de TTL, eviction e RDB/AOF) e todos os 6 tópicos do edital.
- **Aplicação Prática (Bancada Split-Screen)**:
  - Metade esquerda: **Carrinho de Compras (Hash + TTL)** com cálculo automático Varejo vs. Atacado + **Catálogo de Produtos (Set + Hash + índice único de SKU)**.
  - Metade direita: **Raio-X do Redis ao Vivo** exibindo os comandos Redis executados (`HSET`, `HINCRBY`, `SET NX`, `HDEL`, `EXPIRE`, `DEL`, `SMEMBERS`) e as estruturas reais na memória do Redis.
- **Documentação Arquitetural**: [`AGENTS.md`](AGENTS.md), [`GLOSSARY.md`](GLOSSARY.md), [`docs/adr/0001-modelagem-keyspace-redis-ecommerce.md`](docs/adr/0001-modelagem-keyspace-redis-ecommerce.md) e o guia [`docs/guia-redis-para-quem-sabe-sql.md`](docs/guia-redis-para-quem-sabe-sql.md) (Redis explicado a partir de SQL).

## Modelagem no Redis (Keyspace)

| Chave | Estrutura | TTL | Papel |
|---|---|---|---|
| `produto:{id}` | `Hash` | — | Campos: `id`, `sku`, `nome`, `categoria`, `preco_varejo`, `preco_atacado`, `qt_atacado`, `estoque`, `atualizado_em`. |
| `catalogo:produtos` | `Set` | — | Índice primário dos IDs de produtos ativos (`SADD`, `SMEMBERS`, `SREM`). |
| `catalogo:sku:{sku}` | `String` | — | Trava de unicidade via `SET ... NX`. |
| `carrinho:{cliente_id}` | `Hash` | `1800s` na criação | Campos `item:{produto_id} -> quantidade`, permitindo `HINCRBY` e `HDEL` atômicos. Alterar itens preserva o TTL restante. |
| `auditoria:comandos` | `List` | — | Últimos 50 comandos Redis gravados (`LPUSH` + `LTRIM 0 49`) para exibição no Raio-X. |

## Pré-requisitos e Execução

> No Windows PowerShell onde scripts `.ps1` são bloqueados pela `ExecutionPolicy`, utilize `npm.cmd` e `npx.cmd`.

1. **Instalar dependências**:
   ```powershell
   npm.cmd install
   ```

2. **Subir o Redis 7.4 via Docker Compose**:
   ```powershell
   docker compose up -d
   ```
   *(Se o Docker não estiver ativo em desenvolvimento local, o backend realiza fallback automático para `ioredis-mock` em memória e indica o modo no Raio-X.)*

3. **Rodar Backend (Fastify `:3001`) + Frontend (Vite `:5173`)**:
   ```powershell
   npm.cmd run dev
   ```
   Acesse `http://localhost:5173`.

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

1. **Consulta (`SMEMBERS` + `HGETALL` + `TTL`)**: catálogo inicial com 6 produtos e `carrinho:cliente-demo` no Raio-X.
2. **Inserção (`SET NX` + `HSET` + `SADD`)**: cadastrar um novo produto e tentar repetir o mesmo SKU para demonstrar o erro `409 Conflict`.
3. **Atualização Completa (`PUT` -> `HSET`)**: editar os dados completos de um produto ou renovar o TTL do carrinho (`EXPIRE 1800`).
4. **Alteração Parcial (`PATCH` -> `HINCRBY`)**: incrementar itens no carrinho até atingir `qt_atacado` (trocando automaticamente o preço unitário para **ATACADO**) ou ajustar o estoque em `-1`/`+1`.
5. **Exclusão (`HDEL` / `DEL` / `SREM`) e Expiração por TTL**: remover um item do carrinho, clicar em **Simular Expiração (10s)** para observar a chave desaparecer automaticamente do Redis após zerar o TTL, e excluir o produto de teste.
