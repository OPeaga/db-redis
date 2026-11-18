# Roteiro de Apresentação (15 minutos) — Redis: Cache de Chave-Valor em E-commerce

> **Disciplina**: Banco de Dados (UNIFOR) — Trabalho NoSQL (40% da nota: 6,0 pts Teoria + 4,0 pts CRUD Prático).
> **Paradigma Sorteado**: 3. Cache de Chave-Valor (*Key-Value Cache*).
> **SGBD Escolhido**: Redis (`7.4-alpine`).
> **Sistema Aplicado**: d. Lojas Internet / Sistemas Comerciais (`DistriCommerce Cache` — Varejo & Atacado).

---

## Cronograma da Apresentação (14m30s + 30s de folga)

| Bloco | Tempo | Conteúdo |
|---|---|---|
| **0. Abertura & Como o Redis Funciona** | `00:00 – 04:00` (4 min) | Arquitetura RAM-first, Event Loop single-thread + I/O multiplexing, `dict` com rehashing incremental, `redisObject`, TTL passivo/ativo, eviction e persistência RDB/AOF. |
| **1. Paradigma Chave-Valor Cache** | `04:00 – 05:30` (1m30s) | Modelo `chave -> valor` ($O(1)$), padrões *Cache-Aside*, *Write-Through*, *Write-Behind* e casos de uso típicos. |
| **2. Visão Geral, Cluster, Hardware & Cloud** | `05:30 – 08:00` (2m30s) | Redis Sentinel vs. Redis Cluster (16.384 Hash Slots, `CRC16`, Gossip), hardware/RAM, nuvens disponíveis e custos de referência. |
| **3. Mercado, Vantagens & Desvantagens** | `08:00 – 09:30` (1m30s) | Empresas reais (Uber, GitHub, Discord, Mercado Livre), pontos fortes e pontos fracos. |
| **4. Redis em Lojas Internet (Varejo/Atacado)** | `09:30 – 10:30` (1 min) | Justificativa técnica, vantagens/desvantagens no e-commerce e modelagem do keyspace (`Hash`, `Set`, `String NX`, `List`). |
| **5. Aplicação Prática ao Vivo (CRUD)** | `10:30 – 14:30` (4 min) | Demonstração na Bancada Split-Screen com Raio-X do Redis ao vivo: Consulta, Inserção, Atualização, Alteração Parcial, Exclusão e Expiração por TTL. |

---

## Bloco 0 (`00:00 – 04:00`) — Antes de Tudo: Como o Redis Funciona por Dentro

### Slide 1 — Capa e Contextualização
- Apresentar a equipe, o paradigma **Cache de Chave-Valor** e a escolha do **Redis** aplicado ao domínio de **Lojas Internet (`DistriCommerce` Varejo & Atacado)**.

### Slide 2 — Arquitetura em Memória e Event Loop Single-Threaded
- **Por que o Redis é tão rápido (< 1 ms)?**
  1. **RAM-first**: ao contrário de SGBDs relacionais que gravam tuplas em páginas de disco (B-Trees) e usam um *Buffer Pool* em RAM, no Redis a estrutura primária de trabalho vive integralmente na memória principal.
  2. **Event Loop Single-Threaded + I/O Multiplexing**: um único laço de eventos (`ae` event loop) usa chamadas do sistema operacional (`epoll` no Linux, `kqueue` no BSD/macOS) para vigiar milhares de conexões TCP simultâneas sem criar uma thread por cliente.
  3. **Execução sem locks**: como apenas uma thread executa os comandos sobre as estruturas de dados em sequência, não existe disputa por mutex, semáforos nem troca de contexto (*context switch*) da CPU. Todo comando individual é naturalmente **atômico**.
  4. **I/O Threads (Redis 6+)**: a leitura/escrita de buffers de rede e o parsing do protocolo **RESP** (*Redis Serialization Protocol*) podem ser delegados a threads auxiliares de I/O, mas o motor de execução em memória continua single-threaded.

### Slide 3 — Estruturas Internas: `dict`, Rehashing Incremental e `redisObject`
- **Tabela Hash Global (`dict`)**: cada banco lógico (ex.: DB 0) aponta para uma tabela hash principal que mapeia ponteiros de chaves (`sds` — *Simple Dynamic Strings*) para ponteiros de valores (`redisObject`).
- **Incremental Rehashing (sem travar o servidor)**:
  - Quando o fator de carga da tabela hash `ht[0]` cresce demais, o Redis aloca `ht[1]` com o dobro de buckets.
  - Em vez de parar o banco para migrar milhões de chaves de uma só vez, ele move **1 bucket a cada comando executado** (e lotes adicionais no `serverCron`). Durante a transição, leituras consultam `ht[0]` e `ht[1]`, e novas escritas vão direto para `ht[1]`.
- **`redisObject` (`robj`) e Encodings Compactos**:
  - Cada valor carrega `type` (String, Hash, List, Set, ZSet), `encoding`, `lru/lfu` (para eviction) e `refcount`.
  - O Redis adapta a representação física conforme o tamanho: inteiros puros viram `OBJ_ENCODING_INT`, strings curtas (<= 44 bytes) viram `EMBSTR` (alocação contígua em cache L1/L2), e `Hash`/`List`/`ZSet` pequenos usam **`LISTPACK`** (bloco contíguo de bytes em memória) antes de evoluir para Hash Table (`HT`) ou `SKIPLIST`.

### Slide 4 — Expiração de TTL, Eviction e Persistência (RDB + AOF)
- **Como o TTL expira sem varrer a RAM toda?**
  - **Expiração Passiva (*Lazy*)**: ao tentar ler uma chave, o Redis checa o dicionário separado de `expires`. Se o timestamp já passou, apaga a chave na hora e retorna `nil`.
  - **Expiração Ativa (Probabilística)**: a cada 100 ms (10x/s por padrão), o `serverCron` sorteia 20 chaves do dicionário `expires` e apaga as vencidas. Se mais de 25% delas estiverem expiradas, ele repete o sorteio imediatamente até estabilizar abaixo de 25%.
- **Políticas de *Eviction* (`maxmemory-policy`)**: quando a RAM atinge o teto configurado (`maxmemory`), o Redis escolhe entre `noeviction` (retorna erro de escrita), `volatile-lru` (descarta menos usadas recentemente entre as que têm TTL), `allkeys-lru` ou `allkeys-lfu` (por frequência de acesso, usando algoritmo aproximado por amostragem).
- **Persistência opcional no disco**:
  - **RDB (*Snapshot*)**: comando `BGSAVE` chama `fork()` no SO. O kernel usa **Copy-on-Write (CoW)**: processo pai e filho compartilham as mesmas páginas de RAM; uma página só é copiada se o pai alterá-la enquanto o filho grava o `.rdb` no disco.
  - **AOF (*Append-Only File*)**: registra cada comando de mutação em arquivo (`appendfsync everysec` perde no máximo ~1s). No Redis 7+, o modo **Multi-Part AOF** combina base RDB + incrementos AOF.

---

## Bloco 1 (`04:00 – 05:30`) — Paradigma Cache de Chave-Valor

### Slide 5 — Características e Padrões de Uso
- **Modelo lógico**: dicionário associativo onde cada item é acessado por uma chave opaca (`chave -> valor`), com acesso médio $O(1)$, sem *joins*, sem chaves estrangeiras automáticas e sem linguagem SQL relacional.
- **Padrões clássicos de cache**:
  - **Cache-Aside (*Lazy Loading*)**: aplicação consulta o cache -> se *hit*, retorna; se *miss*, busca no banco primário, grava no cache com TTL e devolve.
  - **Write-Through**: aplicação escreve sincronamente no cache e no banco principal.
  - **Write-Behind (*Write-Back*)**: aplicação grava no cache imediatamente e um worker assíncrono persiste em lote no banco principal.
- **Aplicações principais do paradigma**: gerenciamento de sessões, carrinhos de compra, cache de resultados de queries/APIs, *rate limiting* (janelas deslizantes), placares (*leaderboards*) e bloqueios distribuídos.

---

## Bloco 2 (`05:30 – 08:00`) — Visão Geral do Redis: Arquitetura, Cluster, Hardware e Nuvem

### Slide 6 — Arquitetura de Alta Disponibilidade (Sentinel) vs. Escala Horizontal (Cluster)
- **Standalone / Replication (Master-Replica)**: replicação assíncrona onde réplicas recebem o stream de comandos e atendem leituras (`READONLY`).
- **Redis Sentinel**: conjunto de processos monitores (mínimo 3 para quórum) que detectam falha do nó primário e promovem automaticamente uma réplica, avisando os clientes sobre o novo endereço. Não divide dados entre nós.
- **Redis Cluster (Fragmentação Horizontal)**:
  - Divide todo o espaço de chaves em exatamente **16.384 Hash Slots** usando `CRC16(chave) mod 16384`.
  - **Hash Tags** (`carrinho:{cliente_id}`): apenas o trecho entre `{...}` entra no `CRC16`, permitindo agrupar chaves relacionadas no mesmo nó para transações `MULTI/EXEC`.
  - Topologia mínima recomendada em produção: **3 Masters + 3 Replicas** (6 nós, tolera queda de 1 Master por shard).
  - Comunicação entre nós via protocolo **Gossip** em porta deslocada `+10000` (ex.: `6379` para clientes e `16379` para o barramento do cluster). Caso o cliente envie a chave ao nó errado, recebe redirecionamento `-MOVED <slot> <ip:porta>`.

### Slide 7 — Hardware Necessário, Configuração Média, Nuvens e Custos
- **Hardware necessário e gargalos reais**:
  - **CPU**: priorizar **clock alto por núcleo** (single-thread no loop principal); 2 a 4 vCPUs costumam bastar para a maioria das cargas, reservando cores extras para RDB/AOF `fork()` e I/O threads.
  - **Memória RAM**: dimensionar pelo tamanho dos dados + metadados + **30% a 50% de folga** para *Copy-on-Write* em snapshots e buffers de replicação.
  - **Rede**: interface de baixa latência (10 Gbps+ em nuvem), frequentemente o primeiro gargalo em payloads grandes.
  - **Armazenamento**: SSD/NVMe dimensionado se RDB ou AOF estiverem ativos.
- **Configuração média de produção**: `maxmemory` em ~75% da RAM do nó, `maxmemory-policy allkeys-lru` (para cache puro) ou `noeviction` (quando usado com estado crítico), `appendonly yes` com `appendfsync everysec`.
- **Disponibilidade na Nuvem e Custos de Referência (valores aproximados on-demand em USD/mês, região `us-east-1`; São Paulo `sa-east-1` costuma custar ~25–35% a mais)**:

| Provedor / Serviço Gerenciado | Perfil Dev / Pequeno Porte | Produção Média (Alta Disponibilidade) |
|---|---|---|
| **AWS ElastiCache for Redis** | `cache.t4g.micro` (0,5 GB, 2 vCPUs): ~**US$ 12–15/mês** | `cache.r6g.large` (13,07 GB, 2 vCPUs) x 2 nós (Primary + Replica): ~**US$ 260–320/mês**; Cluster 3 shards HA (6 nós): ~**US$ 780–960/mês** |
| **GCP Memorystore for Redis** | Basic Tier 1 GB: ~**US$ 35/mês** | Standard Tier HA (5 GB com réplica multi-zona): ~**US$ 180–210/mês** |
| **Azure Cache for Redis** | Basic C0 (250 MB): ~**US$ 16/mês** | Standard C1 (1 GB HA): ~**US$ 75/mês**; Premium P1 (6 GB com clustering): ~**US$ 410/mês** |
| **Redis Cloud (Oficial)** | Free Tier (30 MB) / Essentials: **US$ 0 a US$ 7/mês** | Pro Multi-AZ (5 GB – 12 GB): a partir de ~**US$ 150–350/mês** |

*(Observação prática sobre licenciamento: desde a versão 7.4 em 2024, o Redis adotou licença dupla RSALv2/SSPLv1, levando os provedores cloud e a Linux Foundation a manterem também o fork compatível **Valkey**.)*

---

## Bloco 3 (`08:00 – 09:30`) — Aplicações Reais, Vantagens e Desvantagens

### Slide 8 — Aplicações Reais no Mercado
- **Uber**: cache geoespacial e roteamento em tempo real de motoristas e corridas.
- **GitHub**: cache de fragmentos de páginas, filas de jobs em background (Resque) e controle de taxa (*rate limiting*) da API.
- **Discord**: cache de estado de presença e contadores de alta frequência.
- **Twitter / X**: cache de timelines pré-computadas dos usuários ativos.
- **Mercado Livre / E-commerces**: sessões autenticadas, estoque quente em campanhas relâmpago (Black Friday) e carrinhos temporários.

### Slide 9 — Vantagens (Motivos para Usar) vs. Desvantagens (Motivos para Evitar)
- **Vantagens**:
  1. Latência sub-milissegundo e altíssimo throughput (centenas de milhares de ops/s por nó).
  2. Estruturas de dados nativas (`Hash`, `Set`, `Sorted Set`, `List`, `Stream`) evitam trafegar objetos inteiros na rede.
  3. Operações atômicas em servidor (`HINCRBY`, `SET NX`, `MULTI/EXEC`, scripts Lua).
  4. Expiração automática por `TTL` integrada ao motor.
- **Desvantagens**:
  1. Custo elevado por gigabyte (RAM é ordens de grandeza mais cara que disco SSD).
  2. Sem *joins*, sem chaves estrangeiras nem consultas ad-hoc flexíveis como SQL.
  3. Capacidade limitada à memória disponível (exige sharding complexo ao passar da RAM de um nó).
  4. Risco de bloqueio global (*head-of-line blocking*) se um comando $O(N)$ (`KEYS *`, `HGETALL` gigante) travar a thread principal.
  5. Persistência assíncrona (`everysec`) não oferece garantia ACID estrita de zero perda em queda abrupta de energia se usado como banco único.

---

## Bloco 4 (`09:30 – 10:30`) — Redis em Lojas Internet / Sistemas Comerciais

### Slide 10 — Por que Usar (e Quando Não Usar) no E-commerce Varejo & Atacado
- **Por que usar no `DistriCommerce` (Varejo & Atacado)**:
  - Carrinho de compras é altamente volátil: cliente adiciona, incrementa e remove itens dezenas de vezes antes de fechar pedido, e abandona grande parte dos carrinhos (onde o **TTL automático** limpa a memória sem *cron jobs* de DELETE no SQL).
  - O catálogo de produtos recebe leitura maciça a cada exibição de vitrine; servir em cache com precificação `preco_varejo` / `preco_atacado` / `qt_atacado` reduz pressão no banco transacional.
  - Unicidade de SKU garantida atomicamente via `SET catalogo:sku:{sku} {id} NX`.
- **Limitações neste sistema (por que em produção ele complementa o SQL)**:
  - Pedidos fechados, notas fiscais, estornos financeiros e histórico permanente do cliente exigem integridade relacional, relatórios analíticos com `JOIN`/`GROUP BY` e durabilidade em disco (ex.: PostgreSQL + Kafka no `DistriCommerce` completo).
  - Nesta demonstração de Banco de Dados, isolamos **apenas o Redis** para provar as estruturas e o CRUD diretamente no cache.

### Slide 11 — Modelagem do Keyspace no Projeto Prático
- `produto:{id}` (`Hash`): `id`, `sku`, `nome`, `categoria`, `preco_varejo`, `preco_atacado`, `qt_atacado`, `estoque`, `atualizado_em`.
- `catalogo:produtos` (`Set`): índice primário de IDs ativos (`SADD`, `SMEMBERS`, `SREM`).
- `catalogo:sku:{sku}` (`String`): índice único de SKU com `SET ... NX`.
- `carrinho:{cliente_id}` (`Hash`, `TTL 1800s` na criação, preservado nas alterações): pares `item:{produto_id} -> quantidade`.
- `auditoria:comandos` (`List`): últimas 50 operações (`LPUSH` + `LTRIM 0 49`) para o Raio-X em tempo real.

---

## Bloco 5 (`10:30 – 14:30`) — Roteiro da Aplicação Prática (CRUD ao Vivo)

Pré-requisito antes da fala:
1. Subir o Redis via `docker compose up -d`.
2. Rodar backend e frontend via `npm.cmd run dev` e abrir `http://localhost:5173`.
3. Opcionalmente deixar um terminal extra com `docker exec -it projeto-cache-redis redis-cli MONITOR` (ou usar o próprio painel **Raio-X do Redis** na metade direita da tela).

### Sequência exata das operações para mostrar à banca:
1. **Consulta (`READ`)**:
   - Mostrar o catálogo carregado via `SMEMBERS catalogo:produtos` + `HGETALL produto:{id}` e o estado das chaves no Raio-X direito.
2. **Inserção (`CREATE`)**:
   - Cadastrar um novo produto (ex.: `SKU: CHOC-1KG`, Varejo `R$ 42,00`, Atacado `R$ 34,00` a partir de `5` un.). Mostrar no Raio-X `SET catalogo:sku:CHOC-1KG ... NX`, `HSET produto:...` e `SADD catalogo:produtos`.
   - Tentar cadastrar outro produto com o mesmo SKU `CHOC-1KG` para provar o erro `409 Conflict` retornado pela falha do `SET NX`.
   - Adicionar o produto ao carrinho (`HINCRBY carrinho:cliente-demo item:... 1` + `EXPIRE 1800` na criação da chave).
3. **Atualização Completa (`UPDATE`)**:
   - Editar o produto cadastrado alterando nome/preço/categoria (`PUT` -> `HSET` completo com todos os campos do Hash + atualização de `atualizado_em`).
4. **Alteração Parcial (`PATCH`)**:
   - Clicar no botão `+` do item no carrinho até atingir `qt_atacado` (`5` unidades): mostrar `HINCRBY carrinho:cliente-demo item:... 1` alterando apenas 1 campo do Hash em $O(1)$ e mudando automaticamente o badge de **VAREJO** para **ATACADO**.
   - Clicar em `-1` no estoque do produto (`HINCRBY produto:... estoque -1`).
5. **Exclusão (`DELETE`) + Expiração por TTL**:
   - Remover um item específico do carrinho (`HDEL carrinho:cliente-demo item:...`).
   - Clicar em **"Simular Expiração (TTL = 10s)"** (`EXPIRE carrinho:cliente-demo 10`) e aguardar a contagem zerar na tela, provando que o Redis remove a chave automaticamente da memória.
   - Excluir o produto de teste (`DEL produto:...` + `SREM catalogo:produtos` + `DEL catalogo:sku:CHOC-1KG`).
