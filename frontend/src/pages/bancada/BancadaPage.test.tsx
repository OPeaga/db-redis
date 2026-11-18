import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  const auditoria: ComandoAuditado[] = [];
  let seq = 1;

  const registrar = (operacao: ComandoAuditado['operacao'], comando: string): ComandoAuditado => {
    const entry: ComandoAuditado = {
      id: `cmd-${seq++}`,
      operacao,
      comando,
      executadoEm: '2026-11-18T10:01:00.000Z',
    };
    auditoria.unshift(entry);
    return entry;
  };

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

  const montarInspecao = (): EstadoRedis => {
    const chaves: EstadoRedis['chaves'] = [
      {
        chave: 'catalogo:produtos',
        tipo: 'set',
        ttlSegundos: -1,
        valor: produtos.map((p) => p.id),
      },
      ...produtos.map((p) => ({
        chave: `produto:${p.id}`,
        tipo: 'hash' as const,
        ttlSegundos: -1,
        valor: { id: p.id, sku: p.sku, nome: p.nome, estoque: String(p.estoque) },
      })),
    ];

    if (Object.keys(itensCarrinho).length > 0) {
      const hashCarrinho: Record<string, string> = {};
      for (const [k, v] of Object.entries(itensCarrinho)) {
        hashCarrinho[`item:${k}`] = String(v);
      }
      chaves.unshift({
        chave: 'carrinho:cliente-demo',
        tipo: 'hash',
        ttlSegundos: ttlCarrinho,
        valor: hashCarrinho,
      });
    }

    return {
      modoConexao: 'redis-real',
      totalChaves: chaves.length,
      memoriaUsadaLegivel: '1.42M',
      chaves,
      auditoria: [...auditoria],
    };
  };

  return {
    produtos,
    itensCarrinho,
    auditoria,
    registrar,
    montarCarrinho,
    montarInspecao,
    setTtl: (v: number) => {
      ttlCarrinho = v;
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

  http.delete('*/api/carrinho/:clienteId/itens/:produtoId', ({ params }) => {
    const { produtoId } = params as { produtoId: string };
    delete estadoMock.itensCarrinho[produtoId];
    const cmd = estadoMock.registrar('EXCLUSAO', `HDEL carrinho:cliente-demo item:${produtoId}`);
    return HttpResponse.json({ dados: estadoMock.montarCarrinho(), comandosRedis: [cmd] });
  }),

  http.get('*/api/inspecao', () => {
    return HttpResponse.json({ dados: estadoMock.montarInspecao(), comandosRedis: [] });
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  estadoMock = criarEstadoInicial();
});
afterAll(() => server.close());

describe('BancadaPage (Vitrine, Carrinho, Admin e Raio-X Redis)', () => {
  it('carrega Vitrine limpa, navega ao Carrinho e ativa ATACADO via HINCRBY refletindo nos Comandos', async () => {
    const user = userEvent.setup();
    render(<BancadaPage />);

    expect(
      await screen.findByRole('heading', { name: 'Café Torrado e Moído 500g' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.getByText('Redis Real (:6379)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Carrinho de compras' }));

    expect(await screen.findByText('VAREJO')).toBeInTheDocument();

    const btnIncrementar = screen.getByRole('button', {
      name: 'Aumentar quantidade de Café Torrado e Moído 500g',
    });
    await user.click(btnIncrementar);

    expect(await screen.findByText('ATACADO')).toBeInTheDocument();
    const painelComandos = screen.getByRole('tabpanel', { name: 'Comandos Redis' });
    expect(
      within(painelComandos).getByText(/HINCRBY carrinho:cliente-demo item:prod-cafe 1/)
    ).toBeInTheDocument();
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

  it('cadastra novo produto no Painel Admin e remove item do Carrinho via HDEL', async () => {
    const user = userEvent.setup();
    render(<BancadaPage />);

    await screen.findByRole('heading', { name: 'Café Torrado e Moído 500g' });

    await user.click(screen.getByRole('button', { name: 'Painel Admin' }));
    expect(
      await screen.findByRole('heading', { name: 'Itens Disponíveis à Venda' })
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '+ Novo Produto (POST)' }));

    await user.type(screen.getByLabelText('SKU (único)'), 'CHOC-1KG');
    await user.type(screen.getByLabelText('Nome do Produto'), 'Chocolate em Pó 1kg');
    await user.click(screen.getByRole('button', { name: 'Cadastrar no Redis (POST)' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Chocolate em Pó 1kg' })).toBeInTheDocument();
    });

    const painelComandos = screen.getByRole('tabpanel', { name: 'Comandos Redis' });
    expect(within(painelComandos).getByText(/SET catalogo:sku:CHOC-1KG/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Carrinho de compras' }));

    const btnRemover = await screen.findByRole('button', {
      name: 'Remover Café Torrado e Moído 500g do carrinho',
    });
    await user.click(btnRemover);

    await waitFor(() => {
      expect(screen.getByText('Carrinho vazio ou expirado no Redis')).toBeInTheDocument();
    });

    expect(
      within(screen.getByRole('tabpanel', { name: 'Comandos Redis' })).getByText(
        'HDEL carrinho:cliente-demo item:prod-cafe'
      )
    ).toBeInTheDocument();
  });

  it('alterna entre Comandos e Keyspace no Raio-X e permite recolher e expandir o painel lateral', async () => {
    const user = userEvent.setup();
    render(<BancadaPage />);

    await screen.findByRole('heading', { name: 'Café Torrado e Moído 500g' });

    const tabKeyspace = screen.getByRole('tab', { name: /Keyspace/ });
    await user.click(tabKeyspace);

    const painelKeyspace = screen.getByRole('tabpanel', { name: 'Keyspace Redis' });
    expect(within(painelKeyspace).getByText('carrinho:cliente-demo')).toBeInTheDocument();
    expect(within(painelKeyspace).getByText('catalogo:produtos')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Comandos/ }));
    expect(screen.getByRole('tabpanel', { name: 'Comandos Redis' })).toBeInTheDocument();

    const btnOcultar = screen.getByRole('button', { name: /Ocultar Raio-X/ });
    await user.click(btnOcultar);
    expect(
      screen.queryByRole('complementary', { name: 'Raio-X do Redis' })
    ).not.toBeInTheDocument();

    const btnExpandir = screen.getByRole('button', { name: /Raio-X Redis/ });
    await user.click(btnExpandir);
    expect(screen.getByRole('complementary', { name: 'Raio-X do Redis' })).toBeInTheDocument();
  });
});
