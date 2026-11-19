import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type {
  CarrinhoDetalhado,
  ComandoAuditado,
  CriarProdutoInput,
  EstadoRedis,
  Produto,
} from '@projeto-cache/shared';
import { BancadaPage } from './BancadaPage';

function criarEstadoInicial() {
  const produtos: Produto[] = [
    {
      id: 'prod-cafe',
      sku: 'CAFE-500G',
      nome: 'Café Torrado e Moído 500g',
      categoria: 'Mercearia',
      precoVarejo: 24.9,
      precoAtacado: 19.5,
      qtAtacado: 6,
      estoque: 120,
      atualizadoEm: '2026-11-18T10:00:00.000Z',
    },
    {
      id: 'prod-monitor',
      sku: 'MON-27-IPS',
      nome: 'Monitor 27 Full HD IPS 75Hz',
      categoria: 'Informática',
      precoVarejo: 980,
      precoAtacado: 890,
      qtAtacado: 2,
      estoque: 15,
      atualizadoEm: '2026-11-18T10:00:00.000Z',
    },
  ];

  const itensCarrinho: Record<string, number> = { 'prod-cafe': 5 };
  let ttlCarrinho = 1800;
  let seq = 1;
  let chamadasInspecaoGet = 0;
  const ttlsEnviados: number[] = [];

  const registrar = (operacao: ComandoAuditado['operacao'], comando: string): ComandoAuditado => ({
    id: `cmd-${seq++}`,
    operacao,
    comando,
    executadoEm: '2026-11-18T10:01:00.000Z',
  });

  const montarCarrinho = (): CarrinhoDetalhado => {
    const itens = Object.entries(itensCarrinho)
      .map(([produtoId, quantidade]) => {
        const p = produtos.find((item) => item.id === produtoId);
        if (!p) return null;
        const atacado = p.qtAtacado !== null && quantidade >= p.qtAtacado;
        const precoUnitarioAplicado = atacado ? p.precoAtacado : p.precoVarejo;
        return {
          produtoId: p.id,
          sku: p.sku,
          nome: p.nome,
          quantidade,
          estoqueDisponivel: p.estoque,
          qtAtacado: p.qtAtacado,
          precoVarejo: p.precoVarejo,
          precoAtacado: p.precoAtacado,
          modalidadeAplicada: (atacado ? 'ATACADO' : 'VAREJO') as 'ATACADO' | 'VAREJO',
          precoUnitarioAplicado,
          subtotal: Number((quantidade * precoUnitarioAplicado).toFixed(2)),
          economiaAtacado: Number(
            ((p.precoVarejo - precoUnitarioAplicado) * quantidade).toFixed(2)
          ),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const totalUnidades = itens.reduce((acc, i) => acc + i.quantidade, 0);
    const totalBrutoVarejo = Number(
      itens.reduce((acc, i) => acc + i.quantidade * i.precoVarejo, 0).toFixed(2)
    );
    const totalFinal = Number(itens.reduce((acc, i) => acc + i.subtotal, 0).toFixed(2));
    return {
      clienteId: 'cliente-demo',
      chaveRedis: 'carrinho:cliente-demo',
      ttlSegundos: itens.length > 0 ? ttlCarrinho : -2,
      totalUnidades,
      totalBrutoVarejo,
      economiaTotalAtacado: Number((totalBrutoVarejo - totalFinal).toFixed(2)),
      totalFinal,
      itens,
    };
  };

  const montarInspecao = (): EstadoRedis => ({
    modoConexao: 'redis-real',
    totalChaves: produtos.length + 1,
    memoriaUsadaLegivel: '1.42M',
    chaves: [],
    auditoria: [],
  });

  return {
    produtos,
    itensCarrinho,
    ttlsEnviados,
    registrar,
    montarCarrinho,
    montarInspecao,
    registrarChamadaInspecaoGet: () => {
      chamadasInspecaoGet += 1;
    },
    obterChamadasInspecaoGet: () => chamadasInspecaoGet,
    setTtl: (v: number) => {
      ttlCarrinho = v;
      ttlsEnviados.push(v);
    },
  };
}

let estadoMock = criarEstadoInicial();

const server = setupServer(
  http.get('*/api/produtos', () => {
    const cmd = estadoMock.registrar('CONSULTA', 'SMEMBERS catalogo:produtos');
    return HttpResponse.json({ dados: estadoMock.produtos, comandosRedis: [cmd] });
  }),

  http.post('*/api/produtos', async ({ request }) => {
    const body = (await request.json()) as CriarProdutoInput;
    if (estadoMock.produtos.some((p) => p.sku === body.sku)) {
      return HttpResponse.json(
        { codigo: 'SKU_DUPLICADO', mensagem: `SKU "${body.sku}" já existe` },
        { status: 409 }
      );
    }
    const novo: Produto = {
      id: `prod-${estadoMock.produtos.length + 1}`,
      ...body,
      atualizadoEm: '2026-11-18T10:02:00.000Z',
    };
    estadoMock.produtos.push(novo);
    const cmd1 = estadoMock.registrar('INSERCAO', `SET catalogo:sku:${novo.sku} "${novo.id}" NX`);
    const cmd2 = estadoMock.registrar('INSERCAO', `HSET produto:${novo.id} sku "${novo.sku}"`);
    return HttpResponse.json({ dados: novo, comandosRedis: [cmd1, cmd2] }, { status: 201 });
  }),

  http.get('*/api/carrinho/:clienteId', () => {
    const cmd = estadoMock.registrar('CONSULTA', 'HGETALL carrinho:cliente-demo');
    return HttpResponse.json({ dados: estadoMock.montarCarrinho(), comandosRedis: [cmd] });
  }),

  http.patch('*/api/carrinho/:clienteId/itens/:produtoId', async ({ params, request }) => {
    const { produtoId } = params as { produtoId: string };
    const body = (await request.json()) as { delta: number };
    const atual = estadoMock.itensCarrinho[produtoId] ?? 0;
    const proximo = atual + body.delta;
    if (proximo <= 0) {
      delete estadoMock.itensCarrinho[produtoId];
    } else {
      estadoMock.itensCarrinho[produtoId] = proximo;
    }
    const cmd = estadoMock.registrar(
      'ALTERACAO',
      `HINCRBY carrinho:cliente-demo item:${produtoId} ${body.delta}`
    );
    return HttpResponse.json({ dados: estadoMock.montarCarrinho(), comandosRedis: [cmd] });
  }),

  http.patch('*/api/carrinho/:clienteId/ttl', async ({ request }) => {
    const body = (await request.json()) as { ttlSegundos: number };
    estadoMock.setTtl(body.ttlSegundos);
    const cmd = estadoMock.registrar(
      'ATUALIZACAO',
      `EXPIRE carrinho:cliente-demo ${body.ttlSegundos}`
    );
    return HttpResponse.json({ dados: estadoMock.montarCarrinho(), comandosRedis: [cmd] });
  }),

  http.delete('*/api/carrinho/:clienteId/itens/:produtoId', ({ params }) => {
    const { produtoId } = params as { produtoId: string };
    delete estadoMock.itensCarrinho[produtoId];
    const cmd = estadoMock.registrar('EXCLUSAO', `HDEL carrinho:cliente-demo item:${produtoId}`);
    return HttpResponse.json({ dados: estadoMock.montarCarrinho(), comandosRedis: [cmd] });
  }),

  http.delete('*/api/carrinho/:clienteId', () => {
    for (const chave of Object.keys(estadoMock.itensCarrinho)) {
      delete estadoMock.itensCarrinho[chave];
    }
    const cmd = estadoMock.registrar('EXCLUSAO', 'DEL carrinho:cliente-demo');
    return HttpResponse.json({ dados: estadoMock.montarCarrinho(), comandosRedis: [cmd] });
  }),

  http.get('*/api/inspecao', () => {
    estadoMock.registrarChamadaInspecaoGet();
    return HttpResponse.json({ dados: estadoMock.montarInspecao(), comandosRedis: [] });
  }),

  http.post('*/api/inspecao/resetar', () => {
    const inicial = criarEstadoInicial();
    estadoMock.produtos.splice(0, estadoMock.produtos.length, ...inicial.produtos);
    for (const chave of Object.keys(estadoMock.itensCarrinho)) {
      delete estadoMock.itensCarrinho[chave];
    }
    estadoMock.itensCarrinho['prod-cafe'] = 2;
    const cmd = estadoMock.registrar(
      'INSERCAO',
      'FLUSHDB -> SEED (6 produtos + carrinho:cliente-demo TTL 1800s)'
    );
    return HttpResponse.json({ dados: estadoMock.montarInspecao(), comandosRedis: [cmd] });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  estadoMock = criarEstadoInicial();
});
afterAll(() => server.close());

describe('BancadaPage (Vitrine, Carrinho e Admin enxutos)', () => {
  it('carrega Vitrine sem Raio-X nem polling de inspeção, navega ao Carrinho e ativa ATACADO', async () => {
    const user = userEvent.setup();
    render(<BancadaPage />);

    expect(
      await screen.findByRole('heading', { name: 'Café Torrado e Moído 500g' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Raio-X do Redis' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Raio-X/i })).not.toBeInTheDocument();
    expect(estadoMock.obterChamadasInspecaoGet()).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Carrinho de compras' }));

    expect(await screen.findByText('VAREJO')).toBeInTheDocument();

    const btnIncrementar = screen.getByRole('button', {
      name: 'Aumentar quantidade de Café Torrado e Moído 500g',
    });
    await user.click(btnIncrementar);

    expect(await screen.findByText('ATACADO')).toBeInTheDocument();
    expect(estadoMock.obterChamadasInspecaoGet()).toBe(0);
  });

  it('avisa no Carrinho quando o estoque atual é menor que a quantidade e bloqueia aumentar', async () => {
    estadoMock.produtos[0].estoque = 3;
    const user = userEvent.setup();
    render(<BancadaPage />);

    await screen.findByRole('heading', { name: 'Café Torrado e Moído 500g' });
    await user.click(screen.getByRole('button', { name: 'Carrinho de compras' }));

    expect(
      await screen.findByText('Estoque atual (3 un.) menor que a quantidade no carrinho (5 un.)')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Aumentar quantidade de Café Torrado e Moído 500g' })
    ).toBeDisabled();
  });

  it('não exibe aviso de estoque quando a quantidade cabe no estoque', async () => {
    const user = userEvent.setup();
    render(<BancadaPage />);

    await screen.findByRole('heading', { name: 'Café Torrado e Moído 500g' });
    await user.click(screen.getByRole('button', { name: 'Carrinho de compras' }));

    await screen.findByText('VAREJO');
    expect(screen.queryByText(/Estoque atual \(/)).not.toBeInTheDocument();
  });

  it('cadastra novo produto no Painel Admin e remove item do Carrinho exibindo estado vazio', async () => {
    const user = userEvent.setup();
    render(<BancadaPage />);

    await screen.findByRole('heading', { name: 'Café Torrado e Moído 500g' });

    await user.click(screen.getByRole('button', { name: 'Painel Admin' }));
    expect(
      await screen.findByRole('heading', { name: 'Itens Disponíveis à Venda' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Novo produto' }));

    await user.type(screen.getByLabelText('SKU (único)'), 'CHOC-1KG');
    await user.type(screen.getByLabelText('Nome do Produto'), 'Chocolate em Pó 1kg');
    await user.click(screen.getByRole('button', { name: 'Cadastrar produto' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Chocolate em Pó 1kg' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Carrinho de compras' }));

    const btnRemover = await screen.findByRole('button', {
      name: 'Remover Café Torrado e Moído 500g do carrinho',
    });
    await user.click(btnRemover);

    await waitFor(() => {
      expect(screen.getByText('Seu carrinho está vazio')).toBeInTheDocument();
    });
    expect(estadoMock.obterChamadasInspecaoGet()).toBe(0);
  });

  it('permite ajustar validade, limpar carrinho e restaurar dados iniciais no Painel Admin', async () => {
    const user = userEvent.setup();
    render(<BancadaPage />);

    await screen.findByRole('heading', { name: 'Café Torrado e Moído 500g' });
    await user.click(screen.getByRole('button', { name: 'Carrinho de compras' }));

    await user.click(await screen.findByRole('button', { name: 'Expirar em 10s' }));
    await waitFor(() => {
      expect(estadoMock.ttlsEnviados).toContain(10);
    });

    await user.click(screen.getByRole('button', { name: 'Renovar (30m)' }));
    await waitFor(() => {
      expect(estadoMock.ttlsEnviados).toContain(1800);
    });

    await user.click(screen.getByRole('button', { name: 'Limpar carrinho' }));
    await waitFor(() => {
      expect(screen.getByText('Seu carrinho está vazio')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Painel Admin' }));
    await user.click(await screen.findByRole('button', { name: 'Restaurar dados iniciais' }));

    await user.click(screen.getByRole('button', { name: 'Carrinho de compras' }));
    expect(await screen.findByText('Carrinho de compras (2)')).toBeInTheDocument();
    expect(estadoMock.obterChamadasInspecaoGet()).toBe(0);
  });
});
