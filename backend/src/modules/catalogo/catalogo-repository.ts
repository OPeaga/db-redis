import type { Produto } from '@projeto-cache/shared';
import type { RastreadorRedis } from '../../infra/redis-client.js';

export const CHAVE_INDICE_PRODUTOS = 'catalogo:produtos';
export const chaveProduto = (id: string): string => `produto:${id}`;
export const chaveSku = (sku: string): string => `catalogo:sku:${sku.toUpperCase()}`;

export interface ICatalogoRepository {
  contarProdutosSemAuditoria(): Promise<number>;
  listarTodos(): Promise<Produto[]>;
  buscarPorId(id: string): Promise<Produto | null>;
  reservarSkuUnico(sku: string, produtoId: string): Promise<boolean>;
  liberarSku(sku: string): Promise<void>;
  inserir(produto: Produto): Promise<void>;
  atualizarCompleto(produto: Produto): Promise<void>;
  incrementarEstoque(id: string, delta: number, atualizadoEm: string): Promise<number>;
  atualizarCamposParciais(id: string, campos: Record<string, string>): Promise<void>;
  excluir(produto: Produto): Promise<void>;
  inserirSeedDireto(produto: Produto): Promise<void>;
}

function serializarProdutoHash(produto: Produto): Record<string, string> {
  return {
    id: produto.id,
    sku: produto.sku,
    nome: produto.nome,
    categoria: produto.categoria,
    preco_varejo: produto.precoVarejo.toFixed(2),
    preco_atacado: produto.precoAtacado.toFixed(2),
    qt_atacado: produto.qtAtacado === null ? '' : String(produto.qtAtacado),
    estoque: String(produto.estoque),
    atualizado_em: produto.atualizadoEm,
  };
}

function resumirCamposHash(hash: Record<string, string>): string {
  return Object.entries(hash)
    .map(([campo, valor]) => `${campo} "${valor}"`)
    .join(' ');
}

export function deserializarProdutoHash(dados: Record<string, string>): Produto | null {
  if (!dados || Object.keys(dados).length === 0 || !dados.id) {
    return null;
  }

  return {
    id: dados.id,
    sku: dados.sku,
    nome: dados.nome,
    categoria: dados.categoria,
    precoVarejo: Number(dados.preco_varejo),
    precoAtacado: Number(dados.preco_atacado),
    qtAtacado: dados.qt_atacado ? Number(dados.qt_atacado) : null,
    estoque: Number(dados.estoque),
    atualizadoEm: dados.atualizado_em,
  };
}

export class CatalogoRedisRepository implements ICatalogoRepository {
  constructor(private readonly rastreador: RastreadorRedis) {}

  async contarProdutosSemAuditoria(): Promise<number> {
    return this.rastreador.clienteBruto.scard(CHAVE_INDICE_PRODUTOS);
  }

  async listarTodos(): Promise<Produto[]> {
    const ids = await this.rastreador.executar(
      `SMEMBERS ${CHAVE_INDICE_PRODUTOS}`,
      (redis) => redis.smembers(CHAVE_INDICE_PRODUTOS),
      'CONSULTA'
    );

    if (ids.length === 0) {
      return [];
    }

    const pipeline = this.rastreador.clienteBruto.pipeline();
    const idsOrdenados = [...ids].sort();
    for (const id of idsOrdenados) {
      pipeline.hgetall(chaveProduto(id));
    }
    const resultados = await pipeline.exec();
    await this.rastreador.registrarComando(
      `PIPELINE HGETALL produto:{id} (${idsOrdenados.length} chaves)`,
      'CONSULTA'
    );

    const produtos: Produto[] = [];
    for (const item of resultados ?? []) {
      const [erro, valor] = item;
      if (!erro && valor && typeof valor === 'object') {
        const produto = deserializarProdutoHash(valor as Record<string, string>);
        if (produto) {
          produtos.push(produto);
        }
      }
    }

    return produtos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async buscarPorId(id: string): Promise<Produto | null> {
    const dados = await this.rastreador.executar(
      `HGETALL ${chaveProduto(id)}`,
      (redis) => redis.hgetall(chaveProduto(id)),
      'CONSULTA'
    );
    return deserializarProdutoHash(dados);
  }

  async reservarSkuUnico(sku: string, produtoId: string): Promise<boolean> {
    const chave = chaveSku(sku);
    const resposta = await this.rastreador.executar(
      `SET ${chave} "${produtoId}" NX`,
      (redis) => redis.set(chave, produtoId, 'NX'),
      'INSERCAO'
    );
    return resposta === 'OK';
  }

  async liberarSku(sku: string): Promise<void> {
    const chave = chaveSku(sku);
    await this.rastreador.executar(`DEL ${chave}`, (redis) => redis.del(chave), 'EXCLUSAO');
  }

  async inserir(produto: Produto): Promise<void> {
    const hash = serializarProdutoHash(produto);
    const chave = chaveProduto(produto.id);

    await this.rastreador.executar(
      `MULTI -> HSET ${chave} ${resumirCamposHash(hash)} -> SADD ${CHAVE_INDICE_PRODUTOS} "${produto.id}" -> EXEC`,
      async (redis) => {
        const tx = redis.multi();
        tx.hset(chave, hash);
        tx.sadd(CHAVE_INDICE_PRODUTOS, produto.id);
        await tx.exec();
      },
      'INSERCAO'
    );
  }

  async atualizarCompleto(produto: Produto): Promise<void> {
    const hash = serializarProdutoHash(produto);
    const chave = chaveProduto(produto.id);

    await this.rastreador.executar(
      `HSET ${chave} ${resumirCamposHash(hash)}`,
      (redis) => redis.hset(chave, hash),
      'ATUALIZACAO'
    );
  }

  async incrementarEstoque(id: string, delta: number, atualizadoEm: string): Promise<number> {
    const chave = chaveProduto(id);
    return this.rastreador.executar(
      `MULTI -> HINCRBY ${chave} estoque ${delta} -> HSET ${chave} atualizado_em "${atualizadoEm}" -> EXEC`,
      async (redis) => {
        const tx = redis.multi();
        tx.hincrby(chave, 'estoque', delta);
        tx.hset(chave, 'atualizado_em', atualizadoEm);
        const resultados = await tx.exec();
        const [erro, novoEstoque] = resultados?.[0] ?? [new Error('EXEC sem resultado'), 0];
        if (erro) {
          throw erro;
        }
        return Number(novoEstoque);
      },
      'ALTERACAO'
    );
  }

  async atualizarCamposParciais(id: string, campos: Record<string, string>): Promise<void> {
    const chave = chaveProduto(id);
    const resumoCampos = Object.entries(campos)
      .map(([campo, valor]) => `${campo} "${valor}"`)
      .join(' ');
    await this.rastreador.executar(
      `HSET ${chave} ${resumoCampos}`,
      (redis) => redis.hset(chave, campos),
      'ALTERACAO'
    );
  }

  async excluir(produto: Produto): Promise<void> {
    const chavesCarrinhos = await this.rastreador.listarChavesPorPadrao('carrinho:*');
    const campoItem = `item:${produto.id}`;

    for (const chaveCar of chavesCarrinhos) {
      const removido = await this.rastreador.clienteBruto.hdel(chaveCar, campoItem);
      if (removido > 0) {
        await this.rastreador.registrarComando(`HDEL ${chaveCar} ${campoItem}`, 'EXCLUSAO');
      }
    }

    const chaveProd = chaveProduto(produto.id);
    const chaveS = chaveSku(produto.sku);

    await this.rastreador.executar(
      `MULTI -> DEL ${chaveProd} -> SREM ${CHAVE_INDICE_PRODUTOS} "${produto.id}" -> DEL ${chaveS} -> EXEC`,
      async (redis) => {
        const tx = redis.multi();
        tx.del(chaveProd);
        tx.srem(CHAVE_INDICE_PRODUTOS, produto.id);
        tx.del(chaveS);
        await tx.exec();
      },
      'EXCLUSAO'
    );
  }

  async inserirSeedDireto(produto: Produto): Promise<void> {
    const tx = this.rastreador.clienteBruto.multi();
    tx.hset(chaveProduto(produto.id), serializarProdutoHash(produto));
    tx.sadd(CHAVE_INDICE_PRODUTOS, produto.id);
    await tx.exec();
    await this.rastreador.clienteBruto.set(chaveSku(produto.sku), produto.id, 'NX');
  }
}
