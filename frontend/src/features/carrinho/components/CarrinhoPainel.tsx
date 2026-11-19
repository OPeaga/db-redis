import React from 'react';
import type { CarrinhoDetalhado } from '@projeto-cache/shared';
import { formatarMoeda, formatarTtl } from '@shared/lib/formatadores';
import { Badge, Button, Card, PriceTag, QuantityStepper } from '@shared/ui/primitives';

export interface CarrinhoPainelProps {
  carrinho: CarrinhoDetalhado | null;
  ttlVivo: number;
  ocupado: boolean;
  onAlterarQuantidade: (produtoId: string, delta: number) => Promise<void>;
  onDefinirQuantidade: (produtoId: string, quantidade: number) => Promise<void>;
  onRemoverItem: (produtoId: string) => Promise<void>;
  onLimparCarrinho: () => Promise<void>;
  onAtualizarTtl: (ttlSegundos: number) => Promise<void>;
  onContinuarComprando?: () => void;
}

export const CarrinhoPainel: React.FC<CarrinhoPainelProps> = ({
  carrinho,
  ttlVivo,
  ocupado,
  onAlterarQuantidade,
  onDefinirQuantidade,
  onRemoverItem,
  onLimparCarrinho,
  onAtualizarTtl,
  onContinuarComprando,
}) => {
  const temItens = Boolean(carrinho && carrinho.itens.length > 0);
  const ttlCritico = ttlVivo > 0 && ttlVivo <= 15;

  return (
    <section
      aria-label="Carrinho de compras"
      className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start"
    >
      <div className="xl:col-span-7">
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-brand-black">
              Carrinho de compras ({carrinho?.totalUnidades ?? 0})
            </h2>
            {temItens && onContinuarComprando && (
              <button
                type="button"
                onClick={onContinuarComprando}
                className="text-xs font-semibold text-brand-navy hover:underline cursor-pointer"
              >
                Continuar comprando
              </button>
            )}
          </div>

          {!temItens ? (
            <div className="p-10 text-center space-y-3">
              <p className="text-base font-semibold text-brand-black">Seu carrinho está vazio</p>
              <p className="text-sm text-ink-muted">
                Adicione produtos da vitrine para aproveitar os preços de atacado.
              </p>
              {onContinuarComprando && (
                <Button variant="accent" onClick={onContinuarComprando}>
                  Explorar produtos
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {carrinho?.itens.map((item) => {
                const faltamParaAtacado =
                  item.qtAtacado !== null && item.quantidade < item.qtAtacado
                    ? item.qtAtacado - item.quantidade
                    : 0;

                return (
                  <div
                    key={item.produtoId}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-brand-black">{item.nome}</h3>
                        <span className="font-mono text-[11px] text-ink-muted">{item.sku}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={item.modalidadeAplicada === 'ATACADO' ? 'amber' : 'neutral'}
                        >
                          {item.modalidadeAplicada}
                        </Badge>
                        {item.modalidadeAplicada !== 'ATACADO' &&
                          faltamParaAtacado > 0 &&
                          item.qtAtacado !== null && (
                            <span className="text-xs text-ink-secondary">
                              Adicione mais <strong>{faltamParaAtacado} un.</strong> para pagar{' '}
                              <strong>{formatarMoeda(item.precoAtacado)}/un.</strong>
                            </span>
                          )}
                      </div>

                      {item.quantidade > item.estoqueDisponivel && (
                        <p className="text-xs font-medium text-danger-text">
                          {`Estoque atual (${item.estoqueDisponivel} un.) menor que a quantidade no carrinho (${item.quantidade} un.)`}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-0.5">
                        {item.qtAtacado !== null && item.quantidade < item.qtAtacado && (
                          <button
                            type="button"
                            disabled={ocupado || item.estoqueDisponivel < item.qtAtacado}
                            onClick={() =>
                              void onDefinirQuantidade(item.produtoId, item.qtAtacado!)
                            }
                            className="text-xs font-semibold text-brand-navy hover:underline disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                          >
                            Ir p/ Atacado ({item.qtAtacado})
                          </button>
                        )}

                        <button
                          type="button"
                          aria-label={`Remover ${item.nome} do carrinho`}
                          disabled={ocupado}
                          onClick={() => void onRemoverItem(item.produtoId)}
                          className="text-xs font-medium text-ink-muted hover:text-danger-text disabled:opacity-45 cursor-pointer"
                        >
                          Remover item
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-5 shrink-0">
                      <div className="flex flex-col items-center gap-1">
                        <QuantityStepper
                          value={item.quantidade}
                          max={item.estoqueDisponivel}
                          nomeItem={item.nome}
                          disabled={ocupado}
                          onDecrement={() => void onAlterarQuantidade(item.produtoId, -1)}
                          onIncrement={() => void onAlterarQuantidade(item.produtoId, 1)}
                        />
                        <span className="text-[11px] text-ink-muted tabular-nums">
                          {item.estoqueDisponivel} disponíveis
                        </span>
                      </div>

                      <div className="text-right min-w-26">
                        {item.modalidadeAplicada === 'ATACADO' && (
                          <span className="block text-xs text-ink-muted line-through tabular-nums">
                            {formatarMoeda(item.precoVarejo * item.quantidade)}
                          </span>
                        )}
                        <PriceTag value={item.subtotal} size="md" />
                        <span className="block text-[11px] text-ink-muted mt-0.5 tabular-nums">
                          {formatarMoeda(item.precoUnitarioAplicado)} cada
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="xl:col-span-5">
        <Card className="space-y-4">
          <h2 className="text-base font-semibold text-brand-black pb-3 border-b border-border-subtle">
            Resumo do pedido
          </h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-ink-secondary">
              <span>Produtos ({carrinho?.totalUnidades ?? 0})</span>
              <span className="tabular-nums">{formatarMoeda(carrinho?.totalBrutoVarejo ?? 0)}</span>
            </div>

            {(carrinho?.economiaTotalAtacado ?? 0) > 0 && (
              <div className="flex justify-between text-brand-navy font-semibold">
                <span>Economia no atacado</span>
                <span className="tabular-nums">
                  − {formatarMoeda(carrinho?.economiaTotalAtacado ?? 0)}
                </span>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-border-subtle flex items-baseline justify-between">
            <span className="text-base font-semibold text-brand-black">Total</span>
            <PriceTag value={carrinho?.totalFinal ?? 0} size="lg" />
          </div>

          <div className="rounded-md bg-bg-muted p-3.5 space-y-2.5 border border-border-subtle">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink-secondary">Validade do carrinho</span>
              <Badge variant={ttlCritico ? 'danger' : ttlVivo > 0 ? 'amber' : 'neutral'}>
                {temItens ? formatarTtl(ttlVivo) : 'Inativo'}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void onAtualizarTtl(10)}
                disabled={ocupado || !temItens}
              >
                Expirar em 10s
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void onAtualizarTtl(1800)}
                disabled={ocupado || !temItens}
              >
                Renovar (30m)
              </Button>
            </div>

            <Button
              variant="danger"
              size="sm"
              className="w-full"
              onClick={() => void onLimparCarrinho()}
              disabled={ocupado || !temItens}
            >
              Limpar carrinho
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
};
