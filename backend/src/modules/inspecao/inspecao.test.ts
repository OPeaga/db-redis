import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import RedisMock from 'ioredis-mock';
import type { ComandoAuditado } from '@projeto-cache/shared';
import { construirAplicacao, type InstanciaAplicacao } from '../../app.js';
import { formatarComandoTerminal, type IRedisCliente } from '../../infra/redis-client.js';

describe('Módulo Inspeção (Keyspace limpo, Terminal e Reset)', () => {
  let redis: InstanceType<typeof RedisMock>;
  let instancia: InstanciaAplicacao;
  let comandosCapturados: ComandoAuditado[];

  beforeEach(async () => {
    redis = new RedisMock();
    await redis.flushdb();
    comandosCapturados = [];
    instancia = await construirAplicacao({
      redisCliente: redis as unknown as IRedisCliente,
      modoConexao: 'memoria-mock',
      onComando: (entrada) => {
        comandosCapturados.push(entrada);
      },
    });
    await instancia.catalogoService.popularSeedSeVazio();
    await instancia.carrinhoService.popularCarrinhoDemo();
  });

  afterEach(async () => {
    await instancia.app.close();
    await redis.quit();
  });

  it('lê o estado completo das chaves de domínio sem gravar auditoria no Redis', async () => {
    await instancia.app.inject({
      method: 'PATCH',
      url: '/api/carrinho/cliente-demo/itens/prod-cafe',
      payload: { delta: 1 },
    });

    const totalAntes = comandosCapturados.length;

    const inspecao = await instancia.app.inject({
      method: 'GET',
      url: '/api/inspecao',
    });

    expect(inspecao.statusCode).toBe(200);
    const estado = inspecao.json().dados;
    expect(estado.totalChaves).toBeGreaterThan(0);
    expect(estado.chaves.some((c: { chave: string }) => c.chave === 'catalogo:produtos')).toBe(
      true
    );
    expect(estado.chaves.some((c: { chave: string }) => c.chave === 'carrinho:cliente-demo')).toBe(
      true
    );
    expect(estado.auditoria).toEqual([]);
    expect(comandosCapturados).toHaveLength(totalAntes);
  });

  it('não cria a chave auditoria:comandos no Redis após operações de catálogo e carrinho', async () => {
    await instancia.app.inject({ method: 'GET', url: '/api/produtos' });
    await instancia.app.inject({
      method: 'PATCH',
      url: '/api/carrinho/cliente-demo/itens/prod-cafe',
      payload: { delta: 1 },
    });
    await instancia.app.inject({
      method: 'POST',
      url: '/api/produtos',
      payload: {
        sku: 'TERM-01',
        nome: 'Produto Teste Terminal',
        categoria: 'Mercearia',
        precoVarejo: 15,
        precoAtacado: 12,
        qtAtacado: 3,
        estoque: 10,
      },
    });

    expect(await redis.exists('auditoria:comandos')).toBe(0);
  });

  it('notifica onComando e formata comandos para exibição no terminal', async () => {
    await instancia.app.inject({ method: 'GET', url: '/api/produtos' });
    await instancia.app.inject({
      method: 'PATCH',
      url: '/api/carrinho/cliente-demo/itens/prod-cafe',
      payload: { delta: 1 },
    });

    expect(
      comandosCapturados.some(
        (c) => c.operacao === 'CONSULTA' && c.comando === 'SMEMBERS catalogo:produtos'
      )
    ).toBe(true);
    const entradaHincrby = comandosCapturados.find(
      (c) =>
        c.operacao === 'ALTERACAO' && c.comando === 'HINCRBY carrinho:cliente-demo item:prod-cafe 1'
    );
    expect(entradaHincrby).toBeDefined();

    const linhaFormatada = formatarComandoTerminal(entradaHincrby!);
    expect(linhaFormatada).toContain('[ALTERACAO]');
    expect(linhaFormatada).toContain('HINCRBY carrinho:cliente-demo item:prod-cafe 1');
  });

  it('reseta o banco para o seed inicial limpando chaves extras e sem auditoria no Redis', async () => {
    await redis.set('chave:temporaria', 'lixo');

    const reset = await instancia.app.inject({
      method: 'POST',
      url: '/api/inspecao/resetar',
    });

    expect(reset.statusCode).toBe(200);
    expect(await redis.get('chave:temporaria')).toBeNull();
    expect(await redis.exists('auditoria:comandos')).toBe(0);
    expect(await redis.scard('catalogo:produtos')).toBe(6);
    expect(await redis.hget('carrinho:cliente-demo', 'item:prod-cafe')).toBe('2');
  });
});
