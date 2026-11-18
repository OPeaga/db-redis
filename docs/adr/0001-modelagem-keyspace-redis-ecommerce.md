# ADR 0001: Modelagem do Keyspace Redis para E-commerce Varejo & Atacado sem Banco Relacional

- **Status**: accepted

## Contexto

O trabalho prático de Banco de Dados NoSQL (UNIFOR) exige demonstrar um CRUD completo (inserção, consulta, atualização, alteração parcial e exclusão) diretamente no SGBD sorteado (**Redis — Cache de Chave-Valor**) aplicado a uma loja virtual, evitando confundir o avaliador com persistência relacional paralela. Em um cache chave-valor puro, armazenar entidades como strings JSON serializadas obrigaria a aplicação a ler o registro inteiro, desserializar, alterar um campo e regravar todo o objeto (`GET` + `SET`), sem suporte a restrições de unicidade ou listagem segura.

## Decisão

Isolamos a aplicação neste repositório conectando o backend Fastify exclusivamente ao Redis, modelando o keyspace com estruturas nativas e chaves auxiliares de integridade:

- `produto:{id}` como **Hash** e `carrinho:{cliente_id}` como **Hash** com **TTL** (padrão 1800s), com campos em `snake_case`.
- `catalogo:produtos` como **Set** atuando como índice primário de IDs ativos (`SMEMBERS`), evitando `KEYS *` em produção.
- `catalogo:sku:{sku}` como **String** gravada via `SET ... NX` como garantia atômica de unicidade de SKU.
- `auditoria:comandos` como **List** limitada aos últimos 50 comandos (`LPUSH` + `LTRIM 0 49`) para alimentar o painel Raio-X ao vivo.

## Opções Consideradas

- **Strings JSON serializadas (`SET produto:{id} "{...}"`)**: mais simples de serializar, porém perde mutações parciais atômicas (`HINCRBY`, `HSET` de campo único) e dificulta demonstrar a diferença entre atualização completa e alteração pontual no CRUD.
- **Reaproveitar o ecossistema completo do `DistriCommerce` (PostgreSQL + Kafka + 8 serviços Java)**: rejeitado para esta entrega porque obscureceria o papel do Redis na avaliação de Banco de Dados e exigiria infraestrutura desnecessária para os 15 minutos de apresentação.

## Consequências

- Operações parciais como incrementar quantidade no carrinho (`HINCRBY`), baixar estoque (`HINCRBY`) ou remover um único item (`HDEL`) executam em $O(1)$ de forma atômica no servidor Redis.
- A aplicação passa a manter manualmente a consistência entre `produto:{id}`, `catalogo:produtos` e `catalogo:sku:{sku}` usando transações/pipelines (`MULTI/EXEC`) na camada de repositório.
- O painel de inspeção consegue exibir fielmente cada estrutura interna e a contagem regressiva de `TTL` em memória.
