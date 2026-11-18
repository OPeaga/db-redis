import {
  carrinhoDetalhadoSchema,
  type CarrinhoDetalhado,
  type EnvelopeOperacao,
} from '@projeto-cache/shared';
import { httpRequest } from '@shared/api/http-client';

export const carrinhoApi = {
  obter(clienteId: string): Promise<EnvelopeOperacao<CarrinhoDetalhado>> {
    return httpRequest(`/api/carrinho/${encodeURIComponent(clienteId)}`, carrinhoDetalhadoSchema);
  },

  definirItem(
    clienteId: string,
    produtoId: string,
    quantidade: number
  ): Promise<EnvelopeOperacao<CarrinhoDetalhado>> {
    return httpRequest(
      `/api/carrinho/${encodeURIComponent(clienteId)}/itens/${encodeURIComponent(produtoId)}`,
      carrinhoDetalhadoSchema,
      {
        method: 'PUT',
        body: { quantidade },
      }
    );
  },

  alterarQuantidade(
    clienteId: string,
    produtoId: string,
    delta: number
  ): Promise<EnvelopeOperacao<CarrinhoDetalhado>> {
    return httpRequest(
      `/api/carrinho/${encodeURIComponent(clienteId)}/itens/${encodeURIComponent(produtoId)}`,
      carrinhoDetalhadoSchema,
      {
        method: 'PATCH',
        body: { delta },
      }
    );
  },

  atualizarTtl(
    clienteId: string,
    ttlSegundos: number
  ): Promise<EnvelopeOperacao<CarrinhoDetalhado>> {
    return httpRequest(
      `/api/carrinho/${encodeURIComponent(clienteId)}/ttl`,
      carrinhoDetalhadoSchema,
      {
        method: 'PATCH',
        body: { ttlSegundos },
      }
    );
  },

  removerItem(clienteId: string, produtoId: string): Promise<EnvelopeOperacao<CarrinhoDetalhado>> {
    return httpRequest(
      `/api/carrinho/${encodeURIComponent(clienteId)}/itens/${encodeURIComponent(produtoId)}`,
      carrinhoDetalhadoSchema,
      {
        method: 'DELETE',
      }
    );
  },

  limpar(clienteId: string): Promise<EnvelopeOperacao<CarrinhoDetalhado>> {
    return httpRequest(`/api/carrinho/${encodeURIComponent(clienteId)}`, carrinhoDetalhadoSchema, {
      method: 'DELETE',
    });
  },
};
