import Redis from 'ioredis';
import type { IRedisCliente, ModoConexaoRedis } from './redis-client.js';

export interface ConexaoRedisAberta {
  cliente: IRedisCliente;
  modoConexao: ModoConexaoRedis;
}

/**
 * Conecta no Redis configurado em `REDIS_URL` com fallback em memória para desenvolvimento sem Docker.
 */
export async function criarConexaoRedis(
  redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  permitirFallbackMock = process.env.ALLOW_REDIS_MOCK_FALLBACK !== 'false'
): Promise<ConexaoRedisAberta> {
  const clienteReal = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 1500,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  clienteReal.on('error', () => {
    // Evita crash por erro não tratado durante a tentativa inicial de conexão.
  });

  try {
    await clienteReal.connect();
    await clienteReal.ping();
    return {
      cliente: clienteReal as unknown as IRedisCliente,
      modoConexao: 'redis-real',
    };
  } catch (erro) {
    clienteReal.disconnect();
    if (!permitirFallbackMock) {
      throw erro;
    }

    const moduloMock = await import('ioredis-mock');
    const RedisMock = moduloMock.default;
    console.warn(
      `[Redis] Não foi possível conectar em ${redisUrl}. Usando ioredis-mock em memória (inicie o Docker com "docker compose up -d" para Redis real).`
    );
    return {
      cliente: new RedisMock() as unknown as IRedisCliente,
      modoConexao: 'memoria-mock',
    };
  }
}
