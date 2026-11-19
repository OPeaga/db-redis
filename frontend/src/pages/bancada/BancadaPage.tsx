import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import {
  CLIENTE_DEMO_ID,
  type CarrinhoDetalhado,
  type CriarProdutoInput,
  type Produto,
} from '@projeto-cache/shared';
import { carrinhoApi, CarrinhoPainel } from '@features/carrinho';
import { AdminCatalogoPainel, catalogoApi, CatalogoPainel } from '@features/catalogo';
import { ApiError } from '@shared/api/api-error';
import { formatarTtl } from '@shared/lib/formatadores';
import { designTokens } from '@shared/ui/primitives';

type AbaLoja = 'catalogo' | 'carrinho' | 'admin';

export const BancadaPage: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<AbaLoja>('catalogo');
  const [busca, setBusca] = useState('');
  const [buscaInput, setBuscaInput] = useState('');
  const [categoriaAtiva, setCategoriaAtiva] = useState('');

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carrinho, setCarrinho] = useState<CarrinhoDetalhado | null>(null);
  const [ttlVivo, setTtlVivo] = useState<number>(-2);
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const expirouAutomaticamenteRef = useRef(false);

  const carregarTudo = useCallback(async () => {
    setCarregandoInicial(true);
    setErroGeral(null);
    try {
      const [respCatalogo, respCarrinho] = await Promise.all([
        catalogoApi.listar(),
        carrinhoApi.obter(CLIENTE_DEMO_ID),
      ]);
      setProdutos(respCatalogo.dados);
      setCarrinho(respCarrinho.dados);
      setTtlVivo(respCarrinho.dados.ttlSegundos);
      expirouAutomaticamenteRef.current = false;
    } catch (erro) {
      setErroGeral(
        erro instanceof ApiError ? erro.mensagem : 'Erro ao carregar dados iniciais do servidor.'
      );
    } finally {
      setCarregandoInicial(false);
    }
  }, []);

  useEffect(() => {
    void carregarTudo();
  }, [carregarTudo]);

  useEffect(() => {
    if (ttlVivo <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setTtlVivo((atual) => {
        if (atual <= 1) {
          return 0;
        }
        return atual - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [ttlVivo > 0]);

  useEffect(() => {
    if (ttlVivo === 0 && !expirouAutomaticamenteRef.current) {
      expirouAutomaticamenteRef.current = true;
      void (async () => {
        try {
          const respCarrinho = await carrinhoApi.obter(CLIENTE_DEMO_ID);
          setCarrinho(respCarrinho.dados);
          setTtlVivo(respCarrinho.dados.ttlSegundos);
        } catch {
          // Ignora falha transitória durante expiração automática.
        }
      })();
    }
  }, [ttlVivo]);

  const categorias = useMemo(() => {
    return Array.from(new Set(produtos.map((p) => p.categoria))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
  }, [produtos]);

  const quantidadesCarrinho = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const item of carrinho?.itens ?? []) {
      mapa[item.produtoId] = item.quantidade;
    }
    return mapa;
  }, [carrinho]);

  const totalUnidades = carrinho?.totalUnidades ?? 0;

  const executarOperacao = async (
    acao: () => Promise<void>,
    destinoErro: 'geral' | 'formulario' = 'geral'
  ): Promise<boolean> => {
    setOcupado(true);
    setErroGeral(null);
    setErroFormulario(null);
    try {
      await acao();
      return true;
    } catch (erro) {
      const mensagem = erro instanceof ApiError ? erro.mensagem : 'Erro inesperado na operação.';
      if (destinoErro === 'formulario') {
        setErroFormulario(mensagem);
      } else {
        setErroGeral(mensagem);
      }
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const handleRecarregarCatalogo = async () => {
    await executarOperacao(async () => {
      const resp = await catalogoApi.listar();
      setProdutos(resp.dados);
    });
  };

  const handleCriarProduto = async (input: CriarProdutoInput): Promise<boolean> => {
    return executarOperacao(async () => {
      const resp = await catalogoApi.criar(input);
      setProdutos((atuais) =>
        [...atuais, resp.dados].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      );
    }, 'formulario');
  };

  const handleAtualizarProduto = async (id: string, input: CriarProdutoInput): Promise<boolean> => {
    return executarOperacao(async () => {
      const resp = await catalogoApi.atualizar(id, input);
      setProdutos((atuais) =>
        atuais
          .map((p) => (p.id === id ? resp.dados : p))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      );
      const respCarrinho = await carrinhoApi.obter(CLIENTE_DEMO_ID);
      setCarrinho(respCarrinho.dados);
    }, 'formulario');
  };

  const handleAlterarEstoque = async (id: string, delta: number) => {
    await executarOperacao(async () => {
      const resp = await catalogoApi.alterarParcial(id, { deltaEstoque: delta });
      setProdutos((atuais) => atuais.map((p) => (p.id === id ? resp.dados : p)));
    });
  };

  const handleExcluirProduto = async (id: string) => {
    await executarOperacao(async () => {
      await catalogoApi.excluir(id);
      setProdutos((atuais) => atuais.filter((p) => p.id !== id));
      const respCarrinho = await carrinhoApi.obter(CLIENTE_DEMO_ID);
      setCarrinho(respCarrinho.dados);
      setTtlVivo(respCarrinho.dados.ttlSegundos);
    });
  };

  const aplicarRespostaCarrinho = (dados: CarrinhoDetalhado) => {
    setCarrinho(dados);
    setTtlVivo(dados.ttlSegundos);
    expirouAutomaticamenteRef.current = false;
  };

  const handleAdicionarAoCarrinho = async (produtoId: string) => {
    await executarOperacao(async () => {
      const resp = await carrinhoApi.alterarQuantidade(CLIENTE_DEMO_ID, produtoId, 1);
      aplicarRespostaCarrinho(resp.dados);
    });
  };

  const handleAlterarQuantidadeCarrinho = async (produtoId: string, delta: number) => {
    await executarOperacao(async () => {
      const resp = await carrinhoApi.alterarQuantidade(CLIENTE_DEMO_ID, produtoId, delta);
      aplicarRespostaCarrinho(resp.dados);
    });
  };

  const handleDefinirQuantidadeCarrinho = async (produtoId: string, quantidade: number) => {
    await executarOperacao(async () => {
      const resp = await carrinhoApi.definirItem(CLIENTE_DEMO_ID, produtoId, quantidade);
      aplicarRespostaCarrinho(resp.dados);
    });
  };

  const handleRemoverItemCarrinho = async (produtoId: string) => {
    await executarOperacao(async () => {
      const resp = await carrinhoApi.removerItem(CLIENTE_DEMO_ID, produtoId);
      aplicarRespostaCarrinho(resp.dados);
    });
  };

  const handleLimparCarrinho = async () => {
    await executarOperacao(async () => {
      const resp = await carrinhoApi.limpar(CLIENTE_DEMO_ID);
      aplicarRespostaCarrinho(resp.dados);
    });
  };

  const handleAtualizarTtl = async (ttlSegundos: number) => {
    await executarOperacao(async () => {
      const resp = await carrinhoApi.atualizarTtl(CLIENTE_DEMO_ID, ttlSegundos);
      aplicarRespostaCarrinho(resp.dados);
    });
  };

  const handleRestaurarDadosIniciais = async () => {
    setOcupado(true);
    setErroGeral(null);
    setErroFormulario(null);
    try {
      await catalogoApi.restaurarDadosIniciais();

      const [respCatalogo, respCarrinho] = await Promise.all([
        catalogoApi.listar(),
        carrinhoApi.obter(CLIENTE_DEMO_ID),
      ]);
      setProdutos(respCatalogo.dados);
      setCarrinho(respCarrinho.dados);
      setTtlVivo(respCarrinho.dados.ttlSegundos);
      expirouAutomaticamenteRef.current = false;
    } catch (erro) {
      setErroGeral(erro instanceof ApiError ? erro.mensagem : 'Erro ao restaurar dados iniciais.');
    } finally {
      setOcupado(false);
    }
  };

  const handleResetarVitrine = () => {
    setBusca('');
    setBuscaInput('');
    setCategoriaAtiva('');
    setAbaAtiva('catalogo');
  };

  const handleLimparFiltros = () => {
    setBusca('');
    setBuscaInput('');
    setCategoriaAtiva('');
  };

  const handleSubmeterBusca = (e: React.FormEvent) => {
    e.preventDefault();
    setBusca(buscaInput);
    setAbaAtiva('catalogo');
  };

  const handleSelecionarCategoria = (categoria: string) => {
    setCategoriaAtiva(categoria);
    setAbaAtiva('catalogo');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className={designTokens.header.bar}>
        <div className={clsx(designTokens.layout.container, 'pt-3 pb-2.5 space-y-2.5')}>
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <button
              type="button"
              onClick={handleResetarVitrine}
              className="flex items-center gap-2.5 shrink-0 cursor-pointer text-left"
            >
              <div className="w-9 h-9 rounded-md bg-brand-amber text-brand-black font-bold text-sm flex items-center justify-center">
                DC
              </div>
              <div>
                <span className="font-bold text-lg sm:text-xl tracking-tight text-white block leading-none">
                  Distri<span className="text-brand-amber">Commerce</span>
                </span>
                <span className="text-[10px] text-white/65 tracking-wide uppercase">
                  Varejo &amp; Atacado
                </span>
              </div>
            </button>

            <form
              onSubmit={handleSubmeterBusca}
              className="flex-1 min-w-[200px] max-w-2xl relative flex items-center"
            >
              <input
                type="text"
                aria-label="Buscar produtos no catálogo"
                placeholder="Buscar produtos no catálogo…"
                value={buscaInput}
                onChange={(e) => {
                  const valor = e.target.value;
                  setBuscaInput(valor);
                  setBusca(valor);
                }}
                className={clsx(designTokens.header.searchBox, 'pr-12')}
              />
              <button
                type="submit"
                aria-label="Buscar"
                className="absolute right-1 top-1 bottom-1 px-3 rounded-sm bg-brand-amber text-brand-black hover:bg-brand-amber-hover transition-colors cursor-pointer flex items-center justify-center"
              >
                <svg
                  aria-hidden="true"
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                </svg>
              </button>
            </form>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
            <nav aria-label="Categorias do catálogo" className="flex items-center gap-4 flex-wrap">
              <button
                type="button"
                onClick={() => handleSelecionarCategoria('')}
                className={clsx(
                  designTokens.header.navLink,
                  abaAtiva === 'catalogo' && !categoriaAtiva && designTokens.header.navLinkActive
                )}
              >
                Todos
              </button>
              {categorias.map((categoria) => (
                <button
                  key={categoria}
                  type="button"
                  onClick={() => handleSelecionarCategoria(categoria)}
                  className={clsx(
                    designTokens.header.navLink,
                    abaAtiva === 'catalogo' &&
                      categoriaAtiva === categoria &&
                      designTokens.header.navLinkActive
                  )}
                >
                  {categoria}
                </button>
              ))}
            </nav>

            <nav aria-label="Navegação principal" className="flex items-center gap-3 sm:gap-4">
              <button
                type="button"
                onClick={() => setAbaAtiva('catalogo')}
                className={clsx(
                  designTokens.header.navLink,
                  abaAtiva === 'catalogo' && designTokens.header.navLinkActive
                )}
              >
                Vitrine
              </button>

              <button
                type="button"
                onClick={() => setAbaAtiva('admin')}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer',
                  abaAtiva === 'admin'
                    ? 'bg-brand-amber text-brand-black'
                    : 'bg-brand-amber/20 text-brand-amber border border-brand-amber/40 hover:bg-brand-amber hover:text-brand-black'
                )}
              >
                Painel Admin
              </button>

              <button
                type="button"
                onClick={() => setAbaAtiva('carrinho')}
                aria-label="Carrinho de compras"
                className={clsx(
                  'relative inline-flex items-center gap-2 px-2.5 py-1 rounded-md transition-colors cursor-pointer text-xs font-semibold',
                  abaAtiva === 'carrinho'
                    ? 'bg-brand-amber text-brand-black'
                    : 'bg-white/10 text-white hover:bg-white/15'
                )}
              >
                <svg
                  aria-hidden="true"
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                >
                  <circle cx="9" cy="20" r="1.5" />
                  <circle cx="18" cy="20" r="1.5" />
                  <path
                    d="M2.5 3h2.5l2.2 11.2a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L21.5 7H6.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>Carrinho</span>
                {totalUnidades > 0 && (
                  <span
                    className={clsx(
                      'min-w-5 h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center tabular-nums',
                      abaAtiva === 'carrinho'
                        ? 'bg-brand-black text-brand-amber'
                        : 'bg-brand-amber text-brand-black'
                    )}
                  >
                    {totalUnidades}
                  </span>
                )}
                {totalUnidades > 0 && ttlVivo > 0 && (
                  <span
                    className={clsx(
                      'hidden sm:inline text-[10px] font-mono tabular-nums',
                      abaAtiva === 'carrinho' ? 'text-brand-black/80' : 'text-white/75'
                    )}
                  >
                    {formatarTtl(ttlVivo)}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className={clsx(designTokens.layout.container, 'py-6 flex-1 w-full space-y-4')}>
        {erroGeral && (
          <div
            role="alert"
            className="rounded-lg border border-danger-text/30 bg-danger-bg px-4 py-3 text-sm font-medium text-danger-text"
          >
            {erroGeral}
          </div>
        )}

        <div className="space-y-6">
          {abaAtiva === 'catalogo' && (
            <CatalogoPainel
              produtos={produtos}
              carregando={carregandoInicial}
              ocupado={ocupado}
              busca={busca}
              categoriaAtiva={categoriaAtiva}
              quantidadesCarrinho={quantidadesCarrinho}
              onLimparFiltros={handleLimparFiltros}
              onAdicionarAoCarrinho={handleAdicionarAoCarrinho}
              onIrParaCarrinho={() => setAbaAtiva('carrinho')}
            />
          )}

          {abaAtiva === 'carrinho' && (
            <CarrinhoPainel
              carrinho={carrinho}
              ttlVivo={ttlVivo}
              ocupado={ocupado}
              onAlterarQuantidade={handleAlterarQuantidadeCarrinho}
              onDefinirQuantidade={handleDefinirQuantidadeCarrinho}
              onRemoverItem={handleRemoverItemCarrinho}
              onLimparCarrinho={handleLimparCarrinho}
              onAtualizarTtl={handleAtualizarTtl}
              onContinuarComprando={() => setAbaAtiva('catalogo')}
            />
          )}

          {abaAtiva === 'admin' && (
            <AdminCatalogoPainel
              produtos={produtos}
              carregando={carregandoInicial}
              ocupado={ocupado}
              erroFormulario={erroFormulario}
              onRecarregar={handleRecarregarCatalogo}
              onRestaurarDadosIniciais={handleRestaurarDadosIniciais}
              onCriarProduto={handleCriarProduto}
              onAtualizarProduto={handleAtualizarProduto}
              onAlterarEstoque={handleAlterarEstoque}
              onExcluirProduto={handleExcluirProduto}
            />
          )}
        </div>
      </main>
    </div>
  );
};
