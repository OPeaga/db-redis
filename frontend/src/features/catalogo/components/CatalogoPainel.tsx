import React, { useMemo } from 'react';
import type { Produto } from '@projeto-cache/shared';
import { formatarMoeda } from '@shared/lib/formatadores';
import { Button, Card, designTokens, PriceTag } from '@shared/ui/primitives';

export interface CatalogoPainelProps {
  produtos: Produto[];
  carregando: boolean;
  ocupado: boolean;
  busca: string;
  categoriaAtiva: string;
  quantidadesCarrinho: Record<string, number>;
  onLimparFiltros: () => void;
  onAdicionarAoCarrinho: (produtoId: string) => Promise<void>;
  onIrParaCarrinho: () => void;
}

function IconeCategoria({ categoria }: { categoria: string }) {
  const norm = categoria.toLowerCase();

  if (norm.includes('inform') || norm.includes('eletr') || norm.includes('tech')) {
    return (
      <svg
        aria-hidden="true"
        className="w-12 h-12 text-brand-navy/35 group-hover:scale-105 transition-transform duration-200"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" strokeLinecap="round" />
      </svg>
    );
  }

  if (norm.includes('papel') || norm.includes('escrit')) {
    return (
      <svg
        aria-hidden="true"
        className="w-12 h-12 text-brand-navy/35 group-hover:scale-105 transition-transform duration-200"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
        <path d="M14 3v5h5M9 13h6M9 17h4" strokeLinecap="round" />
      </svg>
    );
  }

  if (
    norm.includes('mercear') ||
    norm.includes('grão') ||
    norm.includes('grao') ||
    norm.includes('aliment')
  ) {
    return (
      <svg
        aria-hidden="true"
        className="w-12 h-12 text-brand-navy/35 group-hover:scale-105 transition-transform duration-200"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M6 7h12l-1 13H7L6 7Z" strokeLinejoin="round" />
        <path d="M9 7a3 3 0 0 1 6 0" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className="w-12 h-12 text-brand-navy/35 group-hover:scale-105 transition-transform duration-200"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" strokeLinejoin="round" />
      <path d="m12 12 8-4.5M12 12v9M12 12 4 7.5" strokeLinejoin="round" />
    </svg>
  );
}

export const CatalogoPainel: React.FC<CatalogoPainelProps> = ({
  produtos,
  carregando,
  ocupado,
  busca,
  categoriaAtiva,
  quantidadesCarrinho,
  onLimparFiltros,
  onAdicionarAoCarrinho,
  onIrParaCarrinho,
}) => {
  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      if (categoriaAtiva && p.categoria !== categoriaAtiva) {
        return false;
      }
      if (!termo) {
        return true;
      }
      return (
        p.nome.toLowerCase().includes(termo) ||
        p.sku.toLowerCase().includes(termo) ||
        p.categoria.toLowerCase().includes(termo)
      );
    });
  }, [produtos, busca, categoriaAtiva]);

  const temFiltroAtivo = Boolean(busca.trim() || categoriaAtiva);

  if (carregando) {
    return (
      <Card className="py-12 text-center text-sm text-ink-muted">
        Carregando produtos do catálogo…
      </Card>
    );
  }

  return (
    <section aria-label="Vitrine de produtos" className="space-y-4">
      {temFiltroAtivo && (
        <div className="flex items-center justify-between text-sm text-ink-secondary">
          <span>
            {produtosFiltrados.length} produto{produtosFiltrados.length === 1 ? '' : 's'} encontrado
            {produtosFiltrados.length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={onLimparFiltros}
            className="text-brand-navy font-semibold hover:underline text-xs cursor-pointer"
          >
            Limpar filtros
          </button>
        </div>
      )}

      {produtosFiltrados.length === 0 ? (
        <Card className="py-12 text-center space-y-3">
          <p className="text-sm font-semibold text-brand-black">Nenhum produto encontrado</p>
          <p className="text-xs text-ink-muted">
            {temFiltroAtivo
              ? 'Tente outro termo de busca ou limpe os filtros aplicados.'
              : 'Cadastre um novo produto ou restaure os dados iniciais no Painel Admin.'}
          </p>
          {temFiltroAtivo && (
            <Button variant="secondary" size="sm" onClick={onLimparFiltros}>
              Limpar filtros
            </Button>
          )}
        </Card>
      ) : (
        <div className={designTokens.layout.productGrid}>
          {produtosFiltrados.map((produto) => {
            const descontoPct =
              produto.qtAtacado !== null && produto.precoVarejo > 0
                ? Math.round(
                    ((produto.precoVarejo - produto.precoAtacado) / produto.precoVarejo) * 100
                  )
                : 0;
            const qtdNoCarrinho = quantidadesCarrinho[produto.id] ?? 0;

            return (
              <article key={produto.id} className={designTokens.surface.productCard}>
                <div className="relative h-40 bg-bg-muted/70 overflow-hidden border-b border-border-subtle flex items-center justify-center">
                  <IconeCategoria categoria={produto.categoria} />

                  {descontoPct > 0 && produto.qtAtacado !== null && (
                    <span className="absolute top-2.5 left-2.5 bg-brand-amber text-brand-black text-[11px] font-bold px-2 py-0.5 rounded-sm shadow-2xs">
                      -{descontoPct}% atacado
                    </span>
                  )}

                  <span className="absolute bottom-2 right-2.5 font-mono text-[10px] font-medium text-ink-muted bg-bg-surface/90 border border-border-subtle px-2 py-0.5 rounded-sm">
                    {produto.sku}
                  </span>
                </div>

                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-medium text-brand-black line-clamp-2 leading-snug">
                      {produto.nome}
                    </h3>
                    <p className="text-xs text-ink-muted">
                      {produto.categoria} •{' '}
                      {produto.estoque > 0 ? `${produto.estoque} disponíveis` : 'Esgotado'}
                    </p>

                    <div className="pt-1.5">
                      <PriceTag value={produto.precoVarejo} size="lg" />

                      {produto.qtAtacado !== null && (
                        <p className="mt-1.5 text-xs font-medium text-brand-navy bg-brand-amber-soft px-2 py-1 rounded-sm inline-block">
                          {formatarMoeda(produto.precoAtacado)}/un. a partir de {produto.qtAtacado}{' '}
                          un.
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    {produto.estoque <= 0 ? (
                      <Button variant="ghost" size="md" disabled className="w-full">
                        Indisponível
                      </Button>
                    ) : qtdNoCarrinho > 0 ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="accent"
                          size="md"
                          className="flex-1"
                          onClick={onIrParaCarrinho}
                        >
                          Ver no carrinho ({qtdNoCarrinho})
                        </Button>
                        <Button
                          variant="secondary"
                          size="md"
                          disabled={ocupado || qtdNoCarrinho >= produto.estoque}
                          aria-label={`Adicionar mais 1 de ${produto.nome}`}
                          onClick={() => void onAdicionarAoCarrinho(produto.id)}
                        >
                          +1
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="primary"
                        size="md"
                        className="w-full"
                        disabled={ocupado}
                        onClick={() => void onAdicionarAoCarrinho(produto.id)}
                      >
                        Adicionar ao carrinho
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
