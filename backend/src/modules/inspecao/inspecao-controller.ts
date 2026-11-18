import type { FastifyInstance } from 'fastify';
import type { RastreadorRedis } from '../../infra/redis-client.js';
import type { InspecaoService } from './inspecao-service.js';

export function registrarRotasInspecao(
  app: FastifyInstance,
  service: InspecaoService,
  rastreador: RastreadorRedis
): void {
  app.get('/api/inspecao', async () => {
    const estado = await service.obterEstado();
    return {
      dados: estado,
      comandosRedis: [],
    };
  });

  app.post('/api/inspecao/resetar', async () => {
    const { resultado, comandosRedis } = await rastreador.capturar('INSERCAO', () =>
      service.resetarParaSeed()
    );
    return {
      dados: resultado,
      comandosRedis,
    };
  });
}
