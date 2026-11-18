# DistriCommerce Cache (Varejo & Atacado no Redis)

Plataforma demonstrativa de comércio eletrônico com precificação em varejo e atacado, mantendo catálogo de produtos, controle de unicidade de SKU, carrinho de compras com expiração e trilha de auditoria diretamente em cache chave-valor.

## Linguagem

### Catálogo e Precificação

**Catálogo**: Conjunto de Produtos disponíveis para consulta, gestão e inclusão em Carrinhos na loja. _Evitar_: Vitrine, lista de preços, tabela de itens

**Produto**: Item comercializável identificado por um código SKU único, com preço de varejo, preço de atacado, quantidade mínima para atacado e saldo de estoque. _Evitar_: Mercadoria, artigo, registro

**Modalidade de Preço**: Regime comercial aplicado a um Item de Carrinho, alternando entre Varejo (preço padrão) e Atacado (preço reduzido por volume). _Evitar_: Faixa de desconto, tipo de tabela

**Quantidade Mínima de Atacado**: Quantidade mínima de unidades de um mesmo Produto em um Carrinho a partir da qual todas as unidades desse item passam a ser cobradas pelo preço de Atacado. _Evitar_: Gatilho, lote mínimo

### Carrinho e Cache

**Carrinho**: Sessão temporária de compra associada a um identificador de cliente, que agrupa Itens de Carrinho e expira automaticamente após inatividade. _Evitar_: Cesta, pedido, compra

**Item de Carrinho**: Associação entre um Produto e uma quantidade inteira positiva dentro de um Carrinho. _Evitar_: Linha de compra, subitem

**Tempo de Expiração (TTL)**: Prazo de vida restante, em segundos, antes que um Carrinho seja removido automaticamente da memória pela expiração do cache. _Evitar_: Timeout de sessão, validade

### Inspeção Didática

**Comando Auditado**: Registro cronológico de uma operação executada no mecanismo de cache, contendo o tipo de operação CRUD, o comando textual e o instante da execução. _Evitar_: Log de banco, query trace
