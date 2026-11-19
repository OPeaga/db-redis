# O que é o Redis e Como Ele Funciona (Para Quem Só Sabe o Básico de SQL)

Se você já sabe criar uma tabela (`CREATE TABLE`), colocar dados (`INSERT`), buscar (`SELECT`), mudar (`UPDATE`) e apagar (`DELETE`) no SQL, você já sabe tudo o que precisa para entender o **Redis**.

A diferença principal é que o Redis não guarda seus dados em planilhas com linhas e colunas no HD/SSD. Ele funciona como um grande armário de caixinhas etiquetadas bem em cima da mesa de trabalho.

---

## 1. O que é o Redis? (A Biblioteca no Porão vs. A Mesa de Trabalho)

Imagine que guardar informações é como organizar brinquedos ou livros:

- **Banco SQL tradicional (ex.: PostgreSQL, MySQL):** é uma **biblioteca gigante no porão**. Tudo fica muito bem organizado em cadernos (tabelas), com páginas numeradas e colunas desenhadas com régua. Para achar um dado, você precisa descer a escada (ir ao disco rígido), procurar no índice do caderno e ler a linha inteira. É seguro, cabe muita coisa e permite cruzar vários cadernos ao mesmo tempo (`JOIN`), mas demora um pouco mais.
- **Redis (Cache de Chave-Valor):** é a sua **mesa de trabalho bem na sua frente (memória RAM)**. Em vez de cadernos com tabelas e colunas fixas, na mesa existem **caixinhas com uma etiqueta única colada na frente**.
  - A etiqueta se chama **Chave** (*Key*), por exemplo: `produto:prod-cafe`.
  - O que tem dentro da caixinha se chama **Valor** (*Value*).

Se você sabe a etiqueta exata da caixa, você estica o braço e pega direto em menos de 1 milissegundo. Você não precisa folhear tabela nenhuma.

> **Por que não existem `JOIN`, `SELECT * WHERE preco > 50` ou `FOREIGN KEY` no Redis?**
> Porque o Redis foi feito para velocidade extrema pelo nome da etiqueta (`chave -> valor`), e não para ficar cruzando planilhas diferentes na hora da busca.

---

## 2. Dicionário de Tradução: Do Básico de SQL para o Redis

Para não se perder, compare o que você já faz no SQL com o jeito que fazemos neste projeto (`DistriCommerce Cache`):

| O que você quer fazer | Como você faria no SQL | Como funciona no Redis (neste projeto) |
|---|---|---|
| Criar estrutura da tabela | `CREATE TABLE produtos (...)` | **Não precisa.** No Redis você não cria tabela antes; basta salvar a primeira chave com `HSET`. |
| Guardar um produto (1 linha) | `INSERT INTO produtos VALUES (...)` | Guarda uma caixinha com divisórias chamada **Hash**: `HSET produto:prod-cafe nome "Café..." estoque "120"` |
| Buscar 1 produto pelo ID | `SELECT * FROM produtos WHERE id = 'prod-cafe'` | Abre a caixinha direto pela etiqueta: `HGETALL produto:prod-cafe` |
| Listar todos os produtos | `SELECT * FROM produtos` | Como não existe `SELECT *`, primeiro olhamos uma lista de chamada (`SMEMBERS catalogo:produtos`) e depois abrimos cada produto (`HGETALL produto:{id}`). |
| Impedir SKU repetido | Coluna `sku VARCHAR UNIQUE` | Tenta colar um post-it na parede dizendo "só cola se não existir ninguém aqui": `SET catalogo:sku:CAFE-500G "prod-cafe" NX` |
| Somar ou subtrair estoque | `UPDATE produtos SET estoque = estoque - 1 WHERE id = 'prod-cafe'` | Pede para o Redis somar direto na divisória certa: `HINCRBY produto:prod-cafe estoque -1` |
| Atualizar o produto inteiro | `UPDATE produtos SET nome = ..., preco = ... WHERE id = ...` | Sobrescreve os campos do Hash: `HSET produto:prod-cafe ...` |
| Apagar um produto | `DELETE FROM produtos WHERE id = 'prod-cafe'` | Joga a caixinha fora com `DEL produto:prod-cafe` e tira o nome dele da lista de chamada com `SREM catalogo:produtos "prod-cafe"`. |
| Fazer um dado sumir sozinho | Precisaria de uma coluna `expira_em` e um robô rodando `DELETE` de minuto em minuto | Coloca um cronômetro nativo na caixinha: `EXPIRE carrinho:cliente-demo 1800` (apaga sozinho após 1800 segundos). |

---

## 3. Os 3 Tipos de "Caixinhas" que Usamos no Projeto

Em um cache bem simples, dentro de cada caixinha só caberia um texto comum. O Redis é especial porque a caixinha pode ter **formatos diferentes por dentro**. Neste projeto usamos 3 formatos:

### A. Hash (`produto:{id}` e `carrinho:{cliente_id}`) — A Caixinha com Divisórias
Um **Hash** é igualzinho a **uma única linha de uma tabela SQL**. Em vez de jogar um textão JSON inteiro lá dentro, a caixa tem divisórias nomeadas (`campo -> valor`):

```text
Etiqueta (Chave): produto:prod-cafe
  ├── id:            "prod-cafe"
  ├── sku:           "CAFE-500G"
  ├── nome:          "Café Torrado e Moído 500g"
  ├── preco_varejo:  "24.90"
  ├── preco_atacado: "19.50"
  ├── qt_atacado:    "6"
  └── estoque:       "120"
```

**Por que isso é muito melhor do que guardar tudo como um texto só?**
Imagine que você quer tirar `1` unidade do estoque. Se fosse um textão JSON, você teria que pegar a caixa inteira, ler tudo, alterar o número e devolver tudo pela rede. Com o Hash, você só grita:

```text
HINCRBY produto:prod-cafe estoque -1
```

O Redis vai direto na divisória `estoque` e diminui `1` sem mexer no resto. No carrinho (`carrinho:cliente-demo`), cada divisória é `item:{produto_id} -> quantidade`.

### B. Set (`catalogo:produtos`) — O Saco de Etiquetas Sem Repetição
No SQL, quando você quer ver tudo, você escreve `SELECT * FROM produtos`.
No Redis, as caixinhas ficam todas juntas na mesma sala. Se você mandar ele procurar todas as etiquetas que começam com `produto:` usando `KEYS *`, ele vai ter que olhar **todas as caixinhas da sala uma por uma**, travando o atendimento de todo mundo.

Para resolver isso, criamos um **Set** (um saco que não aceita itens duplicados) chamado `catalogo:produtos`. Toda vez que nasce um produto, colocamos o ID dele dentro desse saco (`SADD catalogo:produtos "prod-cafe"`). Quando queremos listar o catálogo:

1. Perguntamos ao saco quem está lá dentro: `SMEMBERS catalogo:produtos`.
2. Pegamos cada caixinha `produto:{id}` diretamente pelo nome.

### C. String com `NX` (`catalogo:sku:{sku}`) — A Tranca de "Só Entra Se Estiver Vazio"
No SQL, você coloca `UNIQUE` na coluna `sku` e o banco impede dois produtos com o mesmo código. O Redis não tem `UNIQUE` automático entre caixinhas diferentes.

O truque é criar uma caixinha simples (**String**) para cada SKU usando o comando:

```text
SET catalogo:sku:CAFE-500G "prod-cafe" NX
```

O **`NX`** significa *"Not Exists"* (só crie se **não existir**).
Se outro usuário tentar cadastrar `CAFE-500G` ao mesmo tempo, o Redis vê que a etiqueta já existe, recusa na hora e o sistema devolve erro `409 Conflict`. É exatamente o papel da constraint `UNIQUE`, só que feita manualmente pela aplicação.

> **Como acompanhamos os comandos e as caixinhas ao vivo?**
> Em vez de gravar uma chave extra de histórico (`List`) no banco, o terminal do backend imprime em tempo real cada comando executado no Redis, e o **Redis Insight** (`http://localhost:5540`) mostra todas as caixinhas, divisórias e cronômetros (`TTL`) ao vivo sem poluir o keyspace.

---

## 4. Como o Redis Funciona por Dentro (Por que é tão rápido?)

Muita gente acha que o Redis é mágico, mas a velocidade dele vem de 3 decisões simples de engenharia:

### 1. Tudo mora na Memória RAM (Em cima da mesa, não no porão)
O disco rígido (HD ou até SSD) é centenas ou milhares de vezes mais lento do que a memória RAM.
Enquanto o SQL foi desenhado para guardar os dados no disco e usar a RAM só como rascunho temporário, no Redis a **RAM é a casa principal dos dados**. Buscar uma chave em uma tabela hash na RAM leva menos de 1 milissegundo.

### 2. Um Único Atendente Relâmpago (*Event Loop Single-Threaded*)
Imagine uma lanchonete com 10 cozinheiros dividindo a mesma panela: toda hora eles têm que parar, colocar cadeados (*locks*) na panela para um não estragar a comida do outro e ficar esperando a vez.

O Redis faz o contrário: ele tem **apenas 1 atendente principal** executando comandos sobre os dados em memória.
- Como cada comando na RAM é microscópico e super-rápido, esse único atendente atende **centenas de milhares de pedidos por segundo** formando uma fila organizada (`epoll` / `kqueue`).
- Como nunca há dois comandos mexendo na mesma caixinha no mesmo nanossegundo, **não existem locks nem disputa**.
- Quando você manda `HINCRBY carrinho:cliente-demo item:prod-cafe 1`, ninguém consegue entrar no meio da conta. O comando começa e termina inteiro de uma vez (**atômico**).

### 3. Tinta que Desaparece Sozinha (`TTL` — *Time-To-Live*)
No nosso carrinho de compras, colocamos um cronômetro de 30 minutos (`1800` segundos) com `EXPIRE carrinho:cliente-demo 1800`. Quando o tempo acaba, o carrinho some sozinho.

Como o Redis apaga coisas vencidas sem travar o atendente único olhando milhões de caixinhas? Ele usa duas estratégias juntas:
- **Limpeza Preguiçosa (*Lazy*):** se alguém tentar abrir uma caixa (`HGETALL`), o Redis olha o relógio antes. Se já venceu, ele joga fora naquela exata hora e responde que não existe.
- **Limpeza Ativa (o faxineiro aleatório):** 10 vezes por segundo (a cada `100 ms`), o Redis sorteia 20 caixinhas que têm cronômetro e apaga as que já venceram. Se mais de 25% delas estavam vencidas, ele faz outro sorteio rápido até a sala ficar limpa.

### 4. E se acabar a energia? (RAM apaga, mas o Redis tem plano B: `RDB` e `AOF`)
Se você desligar o computador da tomada, a memória RAM zera. Por isso, quando o Redis é usado apenas como cache descartável, perder tudo nem sempre é problema (basta buscar de novo no SQL). Mas se você quiser evitar perder dados ao reiniciar, ele oferece duas cópias opcionais no disco:
- **RDB (*Snapshot*):** de tempos em tempos, o Redis tira uma **"fotografia"** inteira da mesa e salva num arquivo no disco, usando um truque do sistema operacional (*fork* com *Copy-on-Write*) para não travar quem está usando o sistema.
- **AOF (*Append-Only File*):** é o modo ativado no `docker-compose.yml` deste projeto (`--appendonly yes`). O Redis mantém um **"caderno de anotações"** no disco onde escreve cada comando de alteração (`HSET`, `HINCRBY`, `DEL`). Se o servidor cair e voltar, ele lê o caderno do começo ao fim e remonta todas as caixinhas na RAM.

*(Mesmo com AOF, se a energia cair exatamente no segundo em que o comando ainda estava esperando para ir para o disco, cerca de 1 segundo pode ser perdido no modo padrão `everysec`. Por isso o Redis não substitui as garantias rígidas de transação financeira de um banco SQL.)*

---

## 5. Resumo Prático: Quando usar SQL e quando usar Redis?

| Pergunta | Banco SQL (ex.: PostgreSQL) | Redis (Cache de Chave-Valor) |
|---|---|---|
| Onde os dados vivem? | No disco (HD/SSD), com apoio da RAM | Na memória RAM (com backup opcional no disco) |
| Quanto custa guardar 100 GB? | Barato (disco é barato) | Muito caro (RAM custa bem mais caro) |
| Como você busca os dados? | Pesquisas flexíveis (`WHERE`, `LIKE`, `ORDER BY`, `JOIN`) | Pela etiqueta exata da chave (`chave -> valor`) |
| Garante 100% que um pagamento salvo nunca se perde na queda de energia? | Sim (transações ACID em disco) | Não é o foco principal (persistência assíncrona) |
| Melhor uso no mundo real | Cadastro oficial de usuários, pedidos fechados, notas fiscais, relatórios | Carrinho temporário, sessão de login, cache de catálogo, contadores em tempo real, filas rápidas |

**Em resumo:** se o SQL é o **cofre oficial** onde tudo fica registrado para sempre com segurança e organização de planilhas, o Redis é a **bancada expressa em memória** onde deixamos o que precisa ser lido e alterado em menos de 1 milissegundo.
