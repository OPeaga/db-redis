# Roteiro de Apresentação (15 minutos) — Redis: Cache de Chave-Valor em E-commerce

> **Disciplina**: Banco de Dados (UNIFOR) — Trabalho NoSQL (40% da nota: 6,0 pts Teoria + 4,0 pts CRUD Prático).
> **Paradigma Sorteado**: 3. Cache de Chave-Valor (*Key-Value Cache*).
> **SGBD Escolhido**: Redis (`7.4-alpine`).
> **Sistema Aplicado**: d. Lojas Internet / Sistemas Comerciais (`DistriCommerce Cache` — Varejo & Atacado).
> **Material de apoio**: [`guia-redis-para-quem-sabe-sql.md`](guia-redis-para-quem-sabe-sql.md) e apresentação no Canva ([editar/apresentar no Canva](https://www.canva.com/d/gAeiOrcvtFFxBdQ)).

---

## Cronograma da Apresentação (14m30s + 30s de folga)

| Bloco | Slides | Tempo | Conteúdo |
|---|---|---|---|
| **0. Abertura & Como o Redis Funciona** | 1 a 4 | `00:00 – 04:00` (4 min) | Mesa de trabalho (RAM) vs. porão (SQL), atendente único sem locks, as 4 caixinhas (`Hash`, `Set`, `String NX`, `List`), cronômetro `TTL`, `Eviction` e backup `RDB`/`AOF`. |
| **1. Paradigma Chave-Valor Cache** | 5 | `04:00 – 05:30` (1m30s) | Modelo `chave -> valor` ($O(1)$), padrões *Cache-Aside*, *Write-Through*, *Write-Behind* e Redis vs. Memcached. |
| **2. Escala, Hardware, Quando Usar/Evitar** | 6 e 7 | `05:30 – 08:00` (2m30s) | Réplicas, Sentinel (vigia), Cluster (divisão em 6 nós), hardware essencial, cenário típico de uso e quando preferir SQL. |
| **3. Mercado, Vantagens & Desvantagens** | 8 | `08:00 – 09:30` (1m30s) | Empresas reais (Uber, GitHub, Discord, Twitter/X, Mercado Livre), pontos fortes, pontos fracos e riscos (`KEYS *`). |
| **4. Redis no DistriCommerce (Varejo/Atacado)** | 9 | `09:30 – 10:30` (1 min) | Papel do Redis vs. SQL no e-commerce e as 5 chaves modeladas no keyspace. |
| **5. Aplicação Prática ao Vivo (CRUD)** | 10 + Bancada | `10:30 – 14:30` (4 min) | Dicionário SQL -> Redis e demonstração na Bancada Split-Screen com Raio-X ao vivo: Consulta, Inserção, Atualização, Alteração Parcial e Exclusão + TTL. |

---

## Bloco 0 (`00:00 – 04:00`) — Do SQL ao Redis: Como Ele Funciona

### Slide 1 — Capa
- Apresentar a equipe, o paradigma **Cache de Chave-Valor**, o SGBD **Redis** e o sistema **DistriCommerce (Varejo & Atacado)**.

### Slide 2 — Mesa de Trabalho (RAM) e Fila Única (*Single-Threaded*)
- **Biblioteca no porão (SQL) vs. Mesa na frente (Redis)**:
  - No SQL, os dados vivem em planilhas no HD/SSD; bom para cruzar tabelas (`JOIN`), porém exige acesso a disco.
  - No Redis, os dados vivem em **caixinhas etiquetadas na Memória RAM (`chave -> valor`)**, respondendo em menos de 1 ms.
- **Um Único Atendente Relâmpago**: em vez de vários cozinheiros disputando a mesma panela com cadeados (*locks*), um único atendente executa uma fila organizada (`epoll`/`kqueue`) sem disputa. Cada comando começa e termina inteiro sozinho (**atômico**). Threads auxiliares cuidam apenas da rede.

### Slide 3 — Do SQL para as 4 Caixinhas do Redis
- **Ponte com o SQL**:
  - **Sem `CREATE TABLE`**: não há estrutura rígida antes; basta gravar pela etiqueta (`O(1)`).
  - **Cresce sem travar**: quando precisa de mais espaço para chaves, dobra a tabela aos poucos (1 bloco por comando, *rehashing incremental*).
  - **Formato inteligente**: adapta o armazenamento interno para economizar memória RAM.
- **As 4 Caixinhas usadas no projeto**:
  - `HASH` (= 1 linha SQL): caixinha com divisórias (`produto:{id}` e `carrinho:{cliente_id}`).
  - `SET` (= lista de IDs únicos): índice `catalogo:produtos` para listar tudo sem `KEYS *`.
  - `STRING + NX` (= `UNIQUE`): trava `catalogo:sku:{sku}` que só grava se estiver vazio.
  - `LIST` (= pilha de recibos): `auditoria:comandos` guardando os últimos 50 comandos para o Raio-X.

### Slide 4 — Cronômetro (`TTL`), Limite de RAM e Backup (`RDB` + `AOF`)
- **Cronômetro (`TTL`)**: prazo de validade na caixa (`EXPIRE 1800`). Apaga na leitura se venceu (preguiçosa) ou via faxineiro aleatório 10x por segundo (ativa).
- **Se a RAM encher (`Eviction`)**: apaga primeiro caixas menos usadas (`LRU`) ou bloqueia novas escritas (`noeviction`).
- **Se faltar energia (`RDB` + `AOF`)**:
  - `RDB` (Fotografia): salva fotos periódicas da mesa no disco sem travar quem usa.
  - `AOF` (Caderno de anotações): grava cada comando no disco a cada segundo (`appendfsync everysec`) para remontar tudo ao ligar.

---

## Bloco 1 (`04:00 – 05:30`) — Paradigma Cache de Chave-Valor

### Slide 5 — Características, Padrões e Redis vs. Memcached
- Acesso direto por `chave -> valor` ($O(1)$), sem schema rígido, sem `JOIN`, sem chaves estrangeiras nem SQL.
- **Padrões de integração**: *Cache-Aside* (*Lazy Loading*), *Read-Through*, *Write-Through* e *Write-Behind*.
- **Redis vs. Memcached**: Memcached guarda apenas strings brutas (até 1 MB); Redis oferece estruturas com divisórias (`Hash`, `Set`, `List`, `ZSet`) e persistência opcional.
- **Aplicações típicas**: sessões autenticadas, carrinhos de e-commerce, *rate limiting*, placares em tempo real e locks distribuídos.

---

## Bloco 2 (`05:30 – 08:00`) — Como o Redis Escala, Hardware e Quando Usar vs. SQL

### Slide 6 — Como o Redis Escala (Réplicas, Sentinel e Cluster)
1. **Principal e Réplicas**: o servidor Principal recebe alterações e copia tudo para as Réplicas atenderem mais leituras.
2. **Redis Sentinel (O Vigia)**: vigias monitoram o servidor Principal; se ele cair, uma Réplica assume sozinha na hora (*failover automático*).
3. **Redis Cluster (Divisão)**: quando os dados não cabem na RAM de 1 máquina só, o Cluster reparte as caixinhas entre vários servidores.
4. **Regra de Produção**: mínimo de **6 máquinas** — 3 Principais dividindo os dados (Partes A, B e C) + 3 Réplicas de reserva (Cópias A, B e C).

### Slide 7 — Hardware Essencial, Quando Usar e Quando Não Usar
- **Hardware Essencial**: bastante memória RAM (com 30% de folga livre), processador rápido por núcleo (fila única na RAM) e rede rápida (disponível na AWS, Google Cloud e Azure).
- **Quando Usar (Bancada na RAM)**:
  - Dados temporários que mudam toda hora (carrinho de compras, sessão de login).
  - Dados muito lidos que precisam responder em `< 1 ms` (cache de catálogo).
  - Contadores em tempo real, filas rápidas e bloqueio de excesso de acessos.
- **Quando NÃO Usar (Prefira SQL — Cofre no Disco)**:
  - **Pagamentos e Notas**: risco de perder até 1s se faltar luz (use SQL com transações ACID).
  - **Relatórios com `JOIN`**: Redis não cruza tabelas nem possui `GROUP BY`.
  - **Muitos Terabytes**: guardar tudo em RAM custa muito mais caro que SSD.
  - **Busca por qualquer campo**: só acha rápido pela etiqueta exata da chave.

---

## Bloco 3 (`08:00 – 09:30`) — Mercado, Vantagens e Desvantagens

### Slide 8 — Aplicações Reais, Vantagens, Desvantagens e Riscos
- **Empresas reais**: Uber (geolocalização), GitHub (cache e filas Resque), Discord (presença em tempo real), Twitter/X (timelines) e Mercado Livre (picos de tráfego e carrinhos).
- **Vantagens**: latência sub-milissegundo em RAM, estruturas ricas evitando trafegar objetos inteiros, operações atômicas (`HINCRBY`, `SET NX`) e `TTL` nativo.
- **Desvantagens & Riscos**: custo elevado por GB em RAM, sem `JOIN`/SQL, capacidade limitada pela RAM disponível, bloqueio da fila única com `KEYS *` e persistência assíncrona (`everysec`) não substituindo ACID estrito em disco.

---

## Bloco 4 (`09:30 – 10:30`) — Redis no DistriCommerce (Varejo & Atacado)

### Slide 9 — Por Que Usar Aqui e Keyspace Modelado
- **Por que usar aqui**: o carrinho muda o tempo todo e tem alto abandono (o `TTL` de 1800s limpa a memória sozinho), enquanto o catálogo em RAM acelera o cálculo dinâmico de preço **Varejo vs. Atacado**.
- **Limitação no domínio**: pedidos faturados, pagamentos e notas fiscais exigem ACID em disco e `JOIN` (papel complementar do PostgreSQL em produção).
- **As 5 chaves do projeto**:
  - `produto:{id}` (`Hash` = 1 linha de produto)
  - `catalogo:produtos` (`Set` = lista de IDs sem usar `KEYS *`)
  - `catalogo:sku:{sku}` (`String NX` = `UNIQUE` do SKU)
  - `carrinho:{cliente_id}` (`Hash + TTL 30m`)
  - `auditoria:comandos` (`List` = últimos 50 comandos no Raio-X)

---

## Bloco 5 (`10:30 – 14:30`) — Do SQL para o Redis: CRUD ao Vivo

### Slide 10 — As 5 Operações e Roteiro na Bancada (`http://localhost:5173`)
Pré-requisito: `docker compose up -d` e `npm.cmd run dev`.

1. **Consulta (`SELECT`)**: mostrar catálogo (`SMEMBERS catalogo:produtos` + `PIPELINE HGETALL produto:{id}`) e `carrinho:cliente-demo` (`HGETALL` + `TTL`) no Raio-X.
2. **Inserção (`INSERT` + `UNIQUE`)**: cadastrar produto `CHOC-1KG` (`SET catalogo:sku:CHOC-1KG ... NX` + `MULTI HSET/SADD`) e tentar cadastrar SKU repetido para provar `409 Conflict`; adicionar ao carrinho (`HINCRBY` + `EXPIRE 1800`).
3. **Atualização Completa (`UPDATE` linha toda)**: editar cadastro do produto (`PUT` -> `HSET` completo) ou renovar `TTL` (`EXPIRE 1800`).
4. **Alteração Parcial (`campo + 1`)**: clicar em `+` no carrinho (`HINCRBY`) até cruzar `qt_atacado` e ativar **ATACADO** na hora; ajustar estoque (`HINCRBY estoque -1`).
5. **Exclusão (`DELETE` + `TTL`)**: remover 1 item (`HDEL`), clicar em **Simular Expiração (10s)** (`EXPIRE 10`) e assistir ao carrinho sumir sozinho da memória após 10s, e excluir o produto de teste (`DEL` + `SREM` + `DEL sku`).
