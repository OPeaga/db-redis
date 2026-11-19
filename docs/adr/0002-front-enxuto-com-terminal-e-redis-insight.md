# ADR 0002: Front-end Enxuto com Comandos no Terminal e Inspeção via Redis Insight

- **Status**: accepted

## Contexto

Na primeira versão da aplicação (`main`), a interface web exibia uma bancada dividida com o painel lateral **Raio-X do Redis**, além de sufixos técnicos de HTTP e comandos nos botões (`+ Novo Produto (POST)`, `Recarregar (SMEMBERS)`, `Ler (HGETALL)`, `Limpar (DEL)`). Além de poluir visualmente a experiência de loja virtual, o mecanismo de auditoria gravava cada comando executado na chave `auditoria:comandos` (`List`), gerando comandos extras (`LPUSH` + `LTRIM`) a cada operação de negócio e poluindo o keyspace e o monitoramento nativo do Redis.

## Decisão

Desacoplamos a experiência de loja da observabilidade do banco:

1. **Front-end enxuto (`frontend/`)**: remoção do painel lateral Raio-X (`features/inspecao`), da grade split-screen e de todos os jargões técnicos da interface, mantendo de forma discreta os controles necessários à demonstração (**Expirar em 10s**, **Renovar (30m)** e **Limpar carrinho** no Carrinho; **Restaurar dados iniciais** no Painel Admin).
2. **Comandos ao vivo no terminal (`backend/`)**: `RastreadorRedis` passa a emitir os comandos formatados e coloridos (`formatarComandoTerminal`) diretamente para o terminal do backend (`console.log`), sem persistência em `auditoria:comandos`.
3. **Redis Insight no Docker Compose (`docker-compose.yml`)**: inclusão do serviço oficial `redis/redisinsight:latest` na porta `5540`, pré-configurado para conectar automaticamente ao container `redis:6379` com o alias `DistriCommerce`, acompanhado dos atalhos `redis:up`, `redis:monitor` e `redis:cli` no `package.json`.

## Opções Consideradas

- **Manter `auditoria:comandos` (`List`) ativa junto com o Redis Insight**: rejeitada porque cada ação na loja dispararia comandos `LPUSH`/`LTRIM` extras no **Profiler** do Redis Insight e no `redis-cli MONITOR`, além de manter uma chave de infraestrutura misturada ao domínio do e-commerce.
- **Remover também os controles de demo do front (expirar 10s e restaurar dados iniciais)**: rejeitada porque exigiria digitar comandos manuais no CLI durante a apresentação, quebrando o ritmo da demonstração ao vivo.

## Consequências

- **Positivas**:
  - A loja virtual fica limpa, focada no fluxo de compra e gestão Varejo/Atacado, sem polling extra a `GET /api/inspecao`.
  - O keyspace do Redis e o Profiler do Redis Insight refletem exclusivamente as operações do domínio (`produto:{id}`, `catalogo:produtos`, `catalogo:sku:{sku}` e `carrinho:{cliente_id}`).
  - O terminal do backend e o Redis Insight oferecem visibilidade real e profissional dos comandos e estruturas em RAM.
- **Negativas / Trade-offs**:
  - A estrutura `List` (`auditoria:comandos`) deixa de existir no keyspace do projeto; materiais de apresentação que a mencionavam (slides 3 e 9) precisam refletir apenas as 3 estruturas restantes (`Hash`, `Set` e `String NX`).
  - O endpoint `GET /api/inspecao` segue disponível no backend, porém passa a retornar `auditoria: []`.
