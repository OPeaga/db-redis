import type { FastifyInstance } from 'fastify';
import type {
  AlterarEstoquePrecoInput,
  AtualizarProdutoInput,
  CriarProdutoInput,
} from '@projeto-cache/shared';
import type { RastreadorRedis } from '../../infra/redis-client.js';
import type { CatalogoService } from './catalogo-service.js';

export function registrarRotasCatalogo(
  app: FastifyInstance,
  service: CatalogoService,
  rastreador: RastreadorRedis
): void {
  app.get('/api/produtos', async () => {
    const { resultado, comandosRedis } = await rastreador.capturar('CONSULTA', () =>
      service.listarProdutos()
    );
    return { dados: resultado, comandosRedis };
  });

  app.get<{ Params: { id: string } }>('/api/produtos/:id', async (request) => {
    const { resultado, comandosRedis } = await rastreador.capturar('CONSULTA', () =>
      service.obterProduto(request.params.id)
    );
    return { dados: resultado, comandosRedis };
  });

  app.post<{ Body: CriarProdutoInput }>('/api/produtos', async (request, reply) => {
    const { resultado, comandosRedis } = await rastreador.capturar('INSERCAO', () =>
      service.criarProduto(request.body)
    );
    return reply.status(201).send({ dados: resultado, comandosRedis });
  });

  app.put<{ Params: { id: string }; Body: AtualizarProdutoInput }>(
    '/api/produtos/:id',
    async (request) => {
      const { resultado, comandosRedis } = await rastreador.capturar('ATUALIZACAO', () =>
        service.atualizarProduto(request.params.id, request.body)
      );
      return { dados: resultado, comandosRedis };
    }
  );

  app.patch<{ Params: { id: string }; Body: AlterarEstoquePrecoInput }>(
    '/api/produtos/:id',
    async (request) => {
      const { resultado, comandosRedis } = await rastreador.capturar('ALTERACAO', () =>
        service.alterarParcialProduto(request.params.id, request.body)
      );
      return { dados: resultado, comandosRedis };
    }
  );

  app.delete<{ Params: { id: string } }>('/api/produtos/:id', async (request) => {
    const { resultado, comandosRedis } = await rastreador.capturar('EXCLUSAO', () =>
      service.excluirProduto(request.params.id)
    );
    return { dados: resultado, comandosRedis };
  });
}
