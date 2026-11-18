import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import RedisMock from 'ioredis-mock';
import { construirAplicacao, type InstanciaAplicacao } from '../../app.js';
import type { IRedisCliente } from '../../infra/redis-client.js';
import type { Produto } from '@projeto-cache/shared';
import { CatalogoRedisRepository } from './catalogo-repository.js';
import { CatalogoService } from './catalogo-service.js';

class CatalogoRepositoryComFalha extends CatalogoRedisRepository {
  async inserir(_produto: Produto): Promise<void> {
    throw new Error('falha simulada em inserir');
  }

  async atualizarCompleto(_produto: Produto): Promise<void> {
    throw new Error('falha simulada em atualizarCompleto');
  }
}

describe('Módulo Catálogo (CRUD no Redis)', () => {
  let redis: InstanceType<typeof RedisMock>;
  let instancia: InstanciaAplicacao;

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushdb();
    instancia = await construirAplicacao({
      redisCliente: redis as unknown as IRedisCliente,
      modoConexao: 'memoria-mock',
    });
    await instancia.catalogoService.popularSeedSeVazio();
  });

  afterEach(async () => {
    await instancia.app.close();
    await redis.quit();
  });

  it('lista os produtos iniciais gravados em Set + Hash e registra comandos de consulta', async () => {
    const resposta = await instancia.app.inject({
      method: 'GET',
      url: '/api/produtos',
    });

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json();
    expect(corpo.dados).toHaveLength(6);
    expect(
      corpo.comandosRedis.some((c: { comando: string }) => c.comando.startsWith('SMEMBERS'))
    ).toBe(true);
    expect(
      corpo.comandosRedis.some((c: { comando: string }) => c.comando.includes('HGETALL'))
    ).toBe(true);
  });

  it('insere novo produto e bloqueia SKU duplicado com 409 via SET NX', async () => {
    const payload = {
      sku: 'choc-1kg',
      nome: 'Chocolate em Pó 1kg',
      categoria: 'Mercearia',
      precoVarejo: 42,
      precoAtacado: 34,
      qtAtacado: 5,
      estoque: 30,
    };

    const criacao = await instancia.app.inject({
      method: 'POST',
      url: '/api/produtos',
      payload,
    });

    expect(criacao.statusCode).toBe(201);
    const criado = criacao.json();
    expect(criado.dados.sku).toBe('CHOC-1KG');
    expect(await redis.get('catalogo:sku:CHOC-1KG')).toBe(criado.dados.id);
    expect(await redis.sismember('catalogo:produtos', criado.dados.id)).toBe(1);

    const duplicado = await instancia.app.inject({
      method: 'POST',
      url: '/api/produtos',
      payload,
    });

    expect(duplicado.statusCode).toBe(409);
    expect(duplicado.json().codigo).toBe('SKU_DUPLICADO');
  });

  it('executa atualização completa (PUT) trocando SKU e preservando índice único', async () => {
    const atualizacao = await instancia.app.inject({
      method: 'PUT',
      url: '/api/produtos/prod-cafe',
      payload: {
        sku: 'CAFE-PREMIUM',
        nome: 'Café Gourmet 500g',
        categoria: 'Mercearia',
        precoVarejo: 29.9,
        precoAtacado: 24.5,
        qtAtacado: 4,
        estoque: 90,
      },
    });

    expect(atualizacao.statusCode).toBe(200);
    expect(atualizacao.json().dados.sku).toBe('CAFE-PREMIUM');
    expect(await redis.get('catalogo:sku:CAFE-500G')).toBeNull();
    expect(await redis.get('catalogo:sku:CAFE-PREMIUM')).toBe('prod-cafe');
  });

  it('executa alteração parcial atômica de estoque via HINCRBY e valida estoque negativo', async () => {
    const parcial = await instancia.app.inject({
      method: 'PATCH',
      url: '/api/produtos/prod-monitor',
      payload: { deltaEstoque: -5, precoAtacado: 850 },
    });

    expect(parcial.statusCode).toBe(200);
    expect(parcial.json().dados.estoque).toBe(10);
    expect(parcial.json().dados.precoAtacado).toBe(850);
    expect(
      parcial.json().comandosRedis.some((c: { comando: string }) => c.comando.includes('HINCRBY'))
    ).toBe(true);

    const invalida = await instancia.app.inject({
      method: 'PATCH',
      url: '/api/produtos/prod-monitor',
      payload: { deltaEstoque: -50 },
    });

    expect(invalida.statusCode).toBe(400);
    expect(invalida.json().codigo).toBe('ESTOQUE_INSUFICIENTE');
  });

  it('não deixa SKU órfão quando a inserção do produto falha', async () => {
    const service = new CatalogoService(new CatalogoRepositoryComFalha(instancia.rastreador));
    const entrada = {
      sku: 'ORFAO-1',
      nome: 'Produto Órfão',
      categoria: 'Teste',
      precoVarejo: 10,
      precoAtacado: 8,
      qtAtacado: 3,
      estoque: 5,
    };

    await expect(service.criarProduto(entrada)).rejects.toThrow('falha simulada');
    expect(await redis.get('catalogo:sku:ORFAO-1')).toBeNull();

    const novamente = await instancia.catalogoService.criarProduto(entrada);
    expect(novamente.sku).toBe('ORFAO-1');
  });

  it('mantém o SKU antigo e libera o novo quando a atualização completa falha', async () => {
    const service = new CatalogoService(new CatalogoRepositoryComFalha(instancia.rastreador));

    await expect(
      service.atualizarProduto('prod-cafe', {
        sku: 'CAFE-NOVO',
        nome: 'Café',
        categoria: 'Mercearia',
        precoVarejo: 29.9,
        precoAtacado: 24.5,
        qtAtacado: 4,
        estoque: 90,
      })
    ).rejects.toThrow('falha simulada');

    expect(await redis.get('catalogo:sku:CAFE-500G')).toBe('prod-cafe');
    expect(await redis.get('catalogo:sku:CAFE-NOVO')).toBeNull();
  });

  it('exclui produto, libera SKU e remove referências em carrinhos ativos', async () => {
    await redis.hset('carrinho:cliente-teste', 'item:prod-cafe', '2');

    const exclusao = await instancia.app.inject({
      method: 'DELETE',
      url: '/api/produtos/prod-cafe',
    });

    expect(exclusao.statusCode).toBe(200);
    expect(await redis.hgetall('produto:prod-cafe')).toEqual({});
    expect(await redis.sismember('catalogo:produtos', 'prod-cafe')).toBe(0);
    expect(await redis.get('catalogo:sku:CAFE-500G')).toBeNull();
    expect(await redis.hget('carrinho:cliente-teste', 'item:prod-cafe')).toBeNull();
  });
});
