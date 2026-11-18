import { estadoRedisSchema, type EnvelopeOperacao, type EstadoRedis } from '@projeto-cache/shared';
import { httpRequest } from '@shared/api/http-client';

export const inspecaoApi = {
  obterEstado(): Promise<EnvelopeOperacao<EstadoRedis>> {
    return httpRequest('/api/inspecao', estadoRedisSchema);
  },

  resetarSeed(): Promise<EnvelopeOperacao<EstadoRedis>> {
    return httpRequest('/api/inspecao/resetar', estadoRedisSchema, {
      method: 'POST',
    });
  },
};
