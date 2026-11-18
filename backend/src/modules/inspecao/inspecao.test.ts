import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import RedisMock from 'ioredis-mock';
import { construirAplicacao, type InstanciaAplicacao } from '../../app.js';
import type { IRedisCliente } from '../../infra/redis-client.js';

describe('Módulo Inspeção (Raio-X do Keyspace e Reset)', () => {
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
    await instancia.carrinhoService.popularCarrinhoDemo();
  });

  afterEach(async () => {
    await instancia.app.close();
    await redis.quit();
  });

  it('lê o estado completo das chaves e auditoria sem gerar novos comandos de auditoria', async () => {
    await instancia.app.inject({
      method: 'PATCH',
      url: '/api/carrinho/cliente-demo/itens/prod-cafe',
      payload: { delta: 1 },
    });

    const inspecao1 = await instancia.app.inject({
      method: 'GET',
      url: '/api/inspecao',
    });

    expect(inspecao1.statusCode).toBe(200);
    const estado1 = inspecao1.json().dados;
    expect(estado1.totalChaves).toBeGreaterThan(0);
    expect(estado1.chaves.some((c: { chave: string }) => c.chave === 'catalogo:produtos')).toBe(
      true
    );
    expect(estado1.chaves.some((c: { chave: string }) => c.chave === 'carrinho:cliente-demo')).toBe(
      true
    );
    const qtdAuditoriaAntes = estado1.auditoria.length;

    const inspecao2 = await instancia.app.inject({
      method: 'GET',
      url: '/api/inspecao',
    });
    expect(inspecao2.json().dados.auditoria.length).toBe(qtdAuditoriaAntes);
  });

  it('exibe toda a trilha de auditoria guardada (até 50 comandos)', async () => {
    for (let i = 0; i < 20; i += 1) {
      await instancia.app.inject({ method: 'GET', url: '/api/produtos' });
    }

    const resposta = await instancia.app.inject({ method: 'GET', url: '/api/inspecao' });
    const auditoria = resposta.json().dados.auditoria;
    expect(auditoria.length).toBeGreaterThan(30);
    expect(auditoria.length).toBeLessThanOrEqual(50);
  });

  it('reseta o banco para o seed inicial limpando chaves extras', async () => {
    await redis.set('chave:temporaria', 'lixo');

    const reset = await instancia.app.inject({
      method: 'POST',
      url: '/api/inspecao/resetar',
    });

    expect(reset.statusCode).toBe(200);
    expect(await redis.get('chave:temporaria')).toBeNull();
    expect(await redis.scard('catalogo:produtos')).toBe(6);
    expect(await redis.hget('carrinho:cliente-demo', 'item:prod-cafe')).toBe('2');
  });
});
