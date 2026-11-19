import { z } from 'zod';
import {
  estadoRedisSchema,
  produtoSchema,
  type AlterarEstoquePrecoInput,
  type AtualizarProdutoInput,
  type CriarProdutoInput,
  type EnvelopeOperacao,
  type EstadoRedis,
  type Produto,
} from '@projeto-cache/shared';
import { httpRequest } from '@shared/api/http-client';

export const catalogoApi = {
  listar(): Promise<EnvelopeOperacao<Produto[]>> {
    return httpRequest('/api/produtos', z.array(produtoSchema));
  },

  criar(input: CriarProdutoInput): Promise<EnvelopeOperacao<Produto>> {
    return httpRequest('/api/produtos', produtoSchema, {
      method: 'POST',
      body: input,
    });
  },

  atualizar(id: string, input: AtualizarProdutoInput): Promise<EnvelopeOperacao<Produto>> {
    return httpRequest(`/api/produtos/${encodeURIComponent(id)}`, produtoSchema, {
      method: 'PUT',
      body: input,
    });
  },

  alterarParcial(id: string, input: AlterarEstoquePrecoInput): Promise<EnvelopeOperacao<Produto>> {
    return httpRequest(`/api/produtos/${encodeURIComponent(id)}`, produtoSchema, {
      method: 'PATCH',
      body: input,
    });
  },

  excluir(id: string): Promise<EnvelopeOperacao<{ id: string }>> {
    return httpRequest(`/api/produtos/${encodeURIComponent(id)}`, z.object({ id: z.string() }), {
      method: 'DELETE',
    });
  },

  restaurarDadosIniciais(): Promise<EnvelopeOperacao<EstadoRedis>> {
    return httpRequest('/api/inspecao/resetar', estadoRedisSchema, {
      method: 'POST',
    });
  },
};
