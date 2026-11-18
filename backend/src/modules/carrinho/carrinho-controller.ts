import type { FastifyInstance } from 'fastify';
import type {
  AtualizarTtlCarrinhoInput,
  DefinirItemCarrinhoInput,
  IncrementarItemCarrinhoInput,
} from '@projeto-cache/shared';
import type { RastreadorRedis } from '../../infra/redis-client.js';
import type { CarrinhoService } from './carrinho-service.js';

export function registrarRotasCarrinho(
  app: FastifyInstance,
  service: CarrinhoService,
  rastreador: RastreadorRedis
): void {
  app.get<{ Params: { clienteId: string } }>('/api/carrinho/:clienteId', async (request) => {
    const { resultado, comandosRedis } = await rastreador.capturar('CONSULTA', () =>
      service.obterCarrinho(request.params.clienteId)
    );
    return { dados: resultado, comandosRedis };
  });

  app.put<{ Params: { clienteId: string; produtoId: string }; Body: DefinirItemCarrinhoInput }>(
    '/api/carrinho/:clienteId/itens/:produtoId',
    async (request) => {
      const { resultado, comandosRedis } = await rastreador.capturar('INSERCAO', () =>
        service.definirItem(request.params.clienteId, request.params.produtoId, request.body)
      );
      return { dados: resultado, comandosRedis };
    }
  );

  app.patch<{
    Params: { clienteId: string; produtoId: string };
    Body: IncrementarItemCarrinhoInput;
  }>('/api/carrinho/:clienteId/itens/:produtoId', async (request) => {
    const { resultado, comandosRedis } = await rastreador.capturar('ALTERACAO', () =>
      service.alterarQuantidade(request.params.clienteId, request.params.produtoId, request.body)
    );
    return { dados: resultado, comandosRedis };
  });

  app.patch<{ Params: { clienteId: string }; Body: AtualizarTtlCarrinhoInput }>(
    '/api/carrinho/:clienteId/ttl',
    async (request) => {
      const { resultado, comandosRedis } = await rastreador.capturar('ATUALIZACAO', () =>
        service.atualizarTtl(request.params.clienteId, request.body)
      );
      return { dados: resultado, comandosRedis };
    }
  );

  app.delete<{ Params: { clienteId: string; produtoId: string } }>(
    '/api/carrinho/:clienteId/itens/:produtoId',
    async (request) => {
      const { resultado, comandosRedis } = await rastreador.capturar('EXCLUSAO', () =>
        service.removerItem(request.params.clienteId, request.params.produtoId)
      );
      return { dados: resultado, comandosRedis };
    }
  );

  app.delete<{ Params: { clienteId: string } }>('/api/carrinho/:clienteId', async (request) => {
    const { resultado, comandosRedis } = await rastreador.capturar('EXCLUSAO', () =>
      service.limparCarrinho(request.params.clienteId)
    );
    return { dados: resultado, comandosRedis };
  });
}
