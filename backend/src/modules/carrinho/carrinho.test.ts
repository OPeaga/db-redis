import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import RedisMock from 'ioredis-mock';
import { construirAplicacao, type InstanciaAplicacao } from '../../app.js';
import type { IRedisCliente } from '../../infra/redis-client.js';

describe('Módulo Carrinho (Hash + TTL + Varejo/Atacado no Redis)', () => {
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

  it('insere item no carrinho com TTL e alterna de VAREJO para ATACADO via HINCRBY', async () => {
    const insercao = await instancia.app.inject({
      method: 'PUT',
      url: '/api/carrinho/cliente-1/itens/prod-cafe',
      payload: { quantidade: 3 },
    });

    expect(insercao.statusCode).toBe(200);
    const carrinhoVarejo = insercao.json().dados;
    expect(carrinhoVarejo.ttlSegundos).toBeGreaterThan(0);
    expect(carrinhoVarejo.itens[0].modalidadeAplicada).toBe('VAREJO');
    expect(carrinhoVarejo.totalFinal).toBe(74.7);

    const incremento = await instancia.app.inject({
      method: 'PATCH',
      url: '/api/carrinho/cliente-1/itens/prod-cafe',
      payload: { delta: 3 },
    });

    expect(incremento.statusCode).toBe(200);
    const corpoAtacado = incremento.json();
    expect(corpoAtacado.dados.itens[0].quantidade).toBe(6);
    expect(corpoAtacado.dados.itens[0].modalidadeAplicada).toBe('ATACADO');
    expect(corpoAtacado.dados.totalFinal).toBe(117);
    expect(corpoAtacado.dados.economiaTotalAtacado).toBe(32.4);
    expect(
      corpoAtacado.comandosRedis.some((c: { comando: string }) => c.comando.startsWith('HINCRBY'))
    ).toBe(true);
  });

  it('impede adicionar quantidade superior ao estoque disponível', async () => {
    const resposta = await instancia.app.inject({
      method: 'PUT',
      url: '/api/carrinho/cliente-1/itens/prod-monitor',
      payload: { quantidade: 50 },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().codigo).toBe('ESTOQUE_INSUFICIENTE');
  });

  it('ajusta TTL manualmente e remove item ou carrinho inteiro via HDEL / DEL', async () => {
    await instancia.app.inject({
      method: 'PUT',
      url: '/api/carrinho/cliente-1/itens/prod-cafe',
      payload: { quantidade: 2 },
    });
    await instancia.app.inject({
      method: 'PUT',
      url: '/api/carrinho/cliente-1/itens/prod-arroz',
      payload: { quantidade: 1 },
    });

    const ttlResp = await instancia.app.inject({
      method: 'PATCH',
      url: '/api/carrinho/cliente-1/ttl',
      payload: { ttlSegundos: 15 },
    });
    expect(ttlResp.statusCode).toBe(200);
    expect(ttlResp.json().dados.ttlSegundos).toBeLessThanOrEqual(15);

    const removeItem = await instancia.app.inject({
      method: 'DELETE',
      url: '/api/carrinho/cliente-1/itens/prod-cafe',
    });
    expect(removeItem.statusCode).toBe(200);
    expect(removeItem.json().dados.itens).toHaveLength(1);

    const limpaTudo = await instancia.app.inject({
      method: 'DELETE',
      url: '/api/carrinho/cliente-1',
    });
    expect(limpaTudo.statusCode).toBe(200);
    expect(limpaTudo.json().dados.itens).toHaveLength(0);
    expect(await redis.exists('carrinho:cliente-1')).toBe(0);
  });

  it('remove o carrinho do Redis quando o TTL expira de verdade', async () => {
    await instancia.app.inject({
      method: 'PUT',
      url: '/api/carrinho/cliente-1/itens/prod-cafe',
      payload: { quantidade: 1 },
    });
    await instancia.app.inject({
      method: 'PATCH',
      url: '/api/carrinho/cliente-1/ttl',
      payload: { ttlSegundos: 1 },
    });

    await new Promise((resolver) => setTimeout(resolver, 1200));

    const resposta = await instancia.app.inject({ method: 'GET', url: '/api/carrinho/cliente-1' });
    expect(resposta.json().dados.itens).toHaveLength(0);
    expect(resposta.json().dados.ttlSegundos).toBe(-2);
    expect(await redis.exists('carrinho:cliente-1')).toBe(0);
  });

  it('não lista no carrinho um produto excluído do catálogo', async () => {
    await instancia.app.inject({
      method: 'PUT',
      url: '/api/carrinho/cliente-1/itens/prod-cafe',
      payload: { quantidade: 2 },
    });

    await instancia.app.inject({ method: 'DELETE', url: '/api/produtos/prod-cafe' });

    const resposta = await instancia.app.inject({ method: 'GET', url: '/api/carrinho/cliente-1' });
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().dados.itens).toHaveLength(0);
    expect(await redis.hget('carrinho:cliente-1', 'item:prod-cafe')).toBeNull();
  });

  it('mantém o carrinho legível quando o estoque cai abaixo da quantidade reservada', async () => {
    await instancia.app.inject({
      method: 'PUT',
      url: '/api/carrinho/cliente-1/itens/prod-monitor',
      payload: { quantidade: 10 },
    });
    await instancia.app.inject({
      method: 'PATCH',
      url: '/api/produtos/prod-monitor',
      payload: { deltaEstoque: -10 },
    });

    const resposta = await instancia.app.inject({ method: 'GET', url: '/api/carrinho/cliente-1' });
    expect(resposta.statusCode).toBe(200);
    const item = resposta.json().dados.itens[0];
    expect(item.quantidade).toBe(10);
    expect(item.estoqueDisponivel).toBe(5);
  });

  it('preserva o TTL ajustado ao alterar itens (EXPIRE só na criação da chave)', async () => {
    await instancia.app.inject({
      method: 'PUT',
      url: '/api/carrinho/cliente-1/itens/prod-cafe',
      payload: { quantidade: 1 },
    });
    await instancia.app.inject({
      method: 'PATCH',
      url: '/api/carrinho/cliente-1/ttl',
      payload: { ttlSegundos: 15 },
    });

    const incremento = await instancia.app.inject({
      method: 'PATCH',
      url: '/api/carrinho/cliente-1/itens/prod-cafe',
      payload: { delta: 1 },
    });
    expect(incremento.json().dados.ttlSegundos).toBeLessThanOrEqual(15);

    const definicao = await instancia.app.inject({
      method: 'PUT',
      url: '/api/carrinho/cliente-1/itens/prod-arroz',
      payload: { quantidade: 1 },
    });
    expect(definicao.json().dados.ttlSegundos).toBeLessThanOrEqual(15);
  });
});
