# AGENTS.md — DistriCommerce Cache (`projeto-cache`)

Contrato técnico do projeto para a disciplina de Banco de Dados NoSQL (UNIFOR).

## 1. Objetivo e Escopo

Aplicação educacional e apresentável demonstrando o paradigma **Cache de Chave-Valor com Redis** aplicado a uma loja virtual **Varejo & Atacado** (domínio derivado do `DistriCommerce`), sem PostgreSQL, Kafka ou outros SGBDs paralelos.

Entregáveis do repositório:
- Roteiro de apresentação de até 15 minutos em `docs/apresentacao.md`.
- Aplicação full-stack em bancada dividida (Loja Varejo/Atacado à esquerda + Raio-X do Redis ao vivo à direita) executando CRUD completo no Redis.

## 2. Stack e Ferramentas

- **Banco de Dados**: Redis 7.4 (`redis:7.4-alpine` via `docker-compose.yml`, com AOF habilitado `--appendonly yes`).
- **Monorepo**: npm workspaces (`shared`, `backend`, `frontend`).
- **Contratos (`shared/`)**: TypeScript + Zod (fonte única dos schemas HTTP de request, response e erros).
- **Backend (`backend/`)**: Node.js 24, TypeScript, Fastify, `@fastify/cors`, `ioredis`, Zod, Vitest + `ioredis-mock`.
- **Frontend (`frontend/`)**: React 19, Vite, TypeScript (`strict`), Tailwind CSS v4 (`@tailwindcss/vite`), `clsx`, Vitest + `@testing-library/react` + MSW (`msw/node`).
- **Qualidade**: ESLint (com regras de fronteira no frontend e backend) e Prettier.

## 3. Estrutura do Repositório

```
.
├── docker-compose.yml           # Redis 7.4 com AOF e healthcheck
├── package.json                 # Workspaces e scripts raiz
├── shared/                      # Contratos Zod compartilhados (sem regra de negócio)
├── backend/
│   └── src/
│       ├── app.ts               # Raiz de composição (DI)
│       ├── server.ts            # Inicialização HTTP + fallback opcional em dev
│       ├── infra/               # Cliente Redis + gravador/auditoria de comandos
│       └── modules/
│           ├── catalogo/        # repository (interface + Redis), service, controller, seed, test
│           ├── carrinho/        # repository (interface + Redis), service, controller, seed, test
│           └── inspecao/        # leitura de keyspace/TTL, auditoria e reset para seed
├── frontend/
│   └── src/
│       ├── app/                 # Shell da aplicação
│       ├── pages/bancada/       # Página única split-screen (compõe features)
│       ├── features/
│       │   ├── catalogo/        # Catálogo Varejo/Atacado + CRUD de produtos
│       │   ├── carrinho/        # Carrinho com cálculo de atacado e controle de TTL
│       │   └── inspecao/        # Raio-X do Redis (comandos e estruturas em memória)
│       └── shared/              # http-client, api-error, primitives (design system)
└── docs/
    ├── adr/                     # Decisões arquiteturais (ADR 0001)
    ├── apresentacao.md          # Roteiro completo da apresentação (15 min)
    └── guia-redis-para-quem-sabe-sql.md  # Guia didático Redis x SQL
```

## 4. Arquitetura e Acordo de Fronteira

- **Backend (Módulos enxutos com DI/SOLID)**:
  - Fluxo por módulo: `controller -> service -> repository` (com interface `I*Repository` e implementação Redis concreta injetada em `app.ts`).
  - Regras de domínio vivem no `service` e lançam erros semânticos (`ErroDominio` com `invalid`, `not_found`, `conflict`); o plugin de erro HTTP do Fastify traduz para `400`, `404`, `409` ou `500` no formato `erroApiSchema` (`{ codigo, mensagem, detalhes }`).
  - Todo endpoint de mutação ou consulta retorna o envelope `envelopeOperacaoSchema`: `{ dados, comandosRedis }`, carregando exatamente os comandos Redis executados naquela requisição para o Raio-X da UI.
  - Exceções ao envelope: `GET /api/inspecao` devolve `comandosRedis: []` de propósito (a leitura do Raio-X não pode poluir a auditoria que ela mesma exibe) e `GET /api/health` devolve só `{ ok, modoConexao }`.
- **Frontend (`frontend-feature-architecture`)**:
  - Importações descem unidirecionalmente: `app -> pages -> features -> shared`.
  - Features não importam umas às outras nem `app/`; toda comunicação HTTP passa por `src/shared/api/http-client.ts` (regra fiscalizada no ESLint).
  - Paleta oficial (herdada do `DistriCommerce`): `#000000` (Black), `#14213d` (Oxford Navy), `#fca311` (Amber), `#e5e5e5` (Platinum), `#ffffff` (White).
  - Textos da interface ficam direto no código em PT-BR (sem i18n).
- **Idioma dos nomes**:
  - Domínio em português sem acentos ou cedilha (`catalogo`, `carrinho`, `precoVarejo`, `qtAtacado`); termos técnicos em inglês (`Repository`, `Service`, `Controller`, `httpClient`, `Error`).
  - Campos armazenados dentro dos Hashes Redis e nomes de chaves usam `snake_case` (`preco_varejo`, `qt_atacado`, `atualizado_em`, `carrinho:{cliente_id}`).

## 5. Modelo de Dados no Redis (Keyspace)

| Chave | Estrutura | TTL | Papel |
|---|---|---|---|
| `produto:{id}` | `Hash` | — | Campos: `id`, `sku`, `nome`, `categoria`, `preco_varejo`, `preco_atacado`, `qt_atacado`, `estoque`, `atualizado_em`. |
| `catalogo:produtos` | `Set` | — | Índice primário com os IDs dos produtos ativos. |
| `catalogo:sku:{sku}` | `String` | — | Índice único de SKU via `SET ... NX` apontando para o `produto.id`. |
| `carrinho:{cliente_id}` | `Hash` | `1800s` na criação (ajustável) | Pares `item:{produto_id} -> quantidade`. O `EXPIRE` padrão só é aplicado quando a chave não tem TTL; alterar itens preserva o TTL restante ou ajustado manualmente. |
| `auditoria:comandos` | `List` | — | Últimos 50 comandos Redis serializados em JSON (`LPUSH` + `LTRIM 0 49`). |

### Limitações conhecidas (decisões de escopo)

- O carrinho é intenção de compra, não reserva: o estoque não é decrementado ao adicionar. Reduzir `estoque` ou `qt_atacado` de um produto pode deixar um carrinho com mais unidades que o estoque; a UI sinaliza o item, mas o backend não bloqueia a redução.
- Só existe o cliente `cliente-demo` na UI (`CLIENTE_DEMO_ID`, definido em `shared/`).
- A API aceita qualquer `cliente_id`, mas não há autenticação nem cadastro de clientes.
- Escritas que combinam mais de um comando (ex.: alteração parcial de estoque e preços) não são uma única transação, salvo quando o comando auditado indica `MULTI/EXEC`.

## 6. Comandos de Execução, Build e Testes

No Windows PowerShell (onde scripts `.ps1` são bloqueados), usar `npm.cmd` e `npx.cmd`:
- Instalar dependências: `npm.cmd install`
- Subir Redis local: `docker compose up -d`
- Rodar backend + frontend em dev: `npm.cmd run dev`
- Executar todos os testes (em background se demorado): `npm.cmd test`
- Build completo (`shared`, `backend`, `frontend`): `npm.cmd run build`
- Lint e checagem de formatação: `npm.cmd run lint`

## 7. Versionamento (quando em repositório Git)

- Branches: Conventional Branch em PT-BR sem acentos (`feat/painel-ttl`, `fix/validacao-sku`), integração em `dev` (`feat/* -> dev -> release/* -> main`).
- Commits: Conventional Commits 1.0.0 em PT-BR, atômicos, nunca misturando refatoração com funcionalidade ou formatação.
