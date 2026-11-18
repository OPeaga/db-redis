import type { TipoOperacaoCrud } from '@projeto-cache/shared';
import type { RastreadorRedis } from '../../infra/redis-client.js';

export const chaveCarrinho = (clienteId: string): string => `carrinho:${clienteId}`;
export const campoItemCarrinho = (produtoId: string): string => `item:${produtoId}`;

export interface DadosBrutosCarrinho {
  itens: Record<string, number>;
  ttlSegundos: number;
}

export interface ICarrinhoRepository {
  obterItensETtl(clienteId: string): Promise<DadosBrutosCarrinho>;
  obterQuantidadeItem(clienteId: string, produtoId: string): Promise<number>;
  definirQuantidade(
    clienteId: string,
    produtoId: string,
    quantidade: number,
    ttlSegundos: number
  ): Promise<'inserido' | 'atualizado'>;
  incrementarQuantidade(
    clienteId: string,
    produtoId: string,
    delta: number,
    ttlSegundos: number
  ): Promise<number>;
  removerItem(clienteId: string, produtoId: string): Promise<boolean>;
  limpar(clienteId: string): Promise<number>;
  atualizarTtl(clienteId: string, ttlSegundos: number): Promise<boolean>;
  inserirSeedDireto(
    clienteId: string,
    itens: Record<string, number>,
    ttlSegundos: number
  ): Promise<void>;
}

export class CarrinhoRedisRepository implements ICarrinhoRepository {
  constructor(private readonly rastreador: RastreadorRedis) {}

  async obterItensETtl(clienteId: string): Promise<DadosBrutosCarrinho> {
    const chave = chaveCarrinho(clienteId);
    const hash = await this.rastreador.executar(
      `HGETALL ${chave}`,
      (redis) => redis.hgetall(chave),
      'CONSULTA'
    );
    const ttlSegundos = await this.rastreador.executar(
      `TTL ${chave}`,
      (redis) => redis.ttl(chave),
      'CONSULTA'
    );

    const itens: Record<string, number> = {};
    for (const [campo, valor] of Object.entries(hash)) {
      if (campo.startsWith('item:')) {
        const produtoId = campo.slice('item:'.length);
        const qtd = Number.parseInt(valor, 10);
        if (Number.isInteger(qtd) && qtd > 0) {
          itens[produtoId] = qtd;
        }
      }
    }

    return { itens, ttlSegundos };
  }

  /**
   * Aplica o TTL padrão só quando a chave não tem expiração (recém-criada), preservando um TTL já ajustado.
   */
  private async definirTtlSeAusente(
    chave: string,
    ttlSegundos: number,
    operacao: TipoOperacaoCrud
  ): Promise<void> {
    const ttlAtual = await this.rastreador.clienteBruto.ttl(chave);
    if (ttlAtual >= 0) {
      return;
    }

    await this.rastreador.executar(
      `EXPIRE ${chave} ${ttlSegundos}`,
      (redis) => redis.expire(chave, ttlSegundos),
      operacao
    );
  }

  async obterQuantidadeItem(clienteId: string, produtoId: string): Promise<number> {
    const chave = chaveCarrinho(clienteId);
    const campo = campoItemCarrinho(produtoId);
    const valor = await this.rastreador.executar(
      `HGET ${chave} ${campo}`,
      (redis) => redis.hget(chave, campo),
      'CONSULTA'
    );
    const parsed = valor ? Number.parseInt(valor, 10) : 0;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
  }

  async definirQuantidade(
    clienteId: string,
    produtoId: string,
    quantidade: number,
    ttlSegundos: number
  ): Promise<'inserido' | 'atualizado'> {
    const chave = chaveCarrinho(clienteId);
    const campo = campoItemCarrinho(produtoId);
    const camposCriados = await this.rastreador.clienteBruto.hset(chave, campo, String(quantidade));
    const operacao = camposCriados > 0 ? 'INSERCAO' : 'ATUALIZACAO';

    await this.rastreador.registrarComando(`HSET ${chave} ${campo} "${quantidade}"`, operacao);
    await this.definirTtlSeAusente(chave, ttlSegundos, operacao);

    return camposCriados > 0 ? 'inserido' : 'atualizado';
  }

  async incrementarQuantidade(
    clienteId: string,
    produtoId: string,
    delta: number,
    ttlSegundos: number
  ): Promise<number> {
    const chave = chaveCarrinho(clienteId);
    const campo = campoItemCarrinho(produtoId);
    const novaQtd = await this.rastreador.executar(
      `HINCRBY ${chave} ${campo} ${delta}`,
      (redis) => redis.hincrby(chave, campo, delta),
      'ALTERACAO'
    );
    await this.definirTtlSeAusente(chave, ttlSegundos, 'ALTERACAO');
    return novaQtd;
  }

  async removerItem(clienteId: string, produtoId: string): Promise<boolean> {
    const chave = chaveCarrinho(clienteId);
    const campo = campoItemCarrinho(produtoId);
    const removidos = await this.rastreador.executar(
      `HDEL ${chave} ${campo}`,
      (redis) => redis.hdel(chave, campo),
      'EXCLUSAO'
    );
    return removidos > 0;
  }

  async limpar(clienteId: string): Promise<number> {
    const chave = chaveCarrinho(clienteId);
    return this.rastreador.executar(`DEL ${chave}`, (redis) => redis.del(chave), 'EXCLUSAO');
  }

  async atualizarTtl(clienteId: string, ttlSegundos: number): Promise<boolean> {
    const chave = chaveCarrinho(clienteId);
    const existe = await this.rastreador.clienteBruto.exists(chave);
    if (existe === 0) {
      return false;
    }

    await this.rastreador.executar(
      `EXPIRE ${chave} ${ttlSegundos}`,
      (redis) => redis.expire(chave, ttlSegundos),
      'ATUALIZACAO'
    );
    return true;
  }

  async inserirSeedDireto(
    clienteId: string,
    itens: Record<string, number>,
    ttlSegundos: number
  ): Promise<void> {
    const chave = chaveCarrinho(clienteId);
    const hash: Record<string, string> = {};
    for (const [produtoId, quantidade] of Object.entries(itens)) {
      hash[campoItemCarrinho(produtoId)] = String(quantidade);
    }

    if (Object.keys(hash).length > 0) {
      await this.rastreador.clienteBruto.hset(chave, hash);
      await this.rastreador.clienteBruto.expire(chave, ttlSegundos);
    }
  }
}
