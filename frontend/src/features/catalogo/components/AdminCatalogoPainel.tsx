import React, { useMemo, useState } from 'react';
import type { CriarProdutoInput, Produto } from '@projeto-cache/shared';
import { formatarMoeda } from '@shared/lib/formatadores';
import { Badge, Button, Card, Input, Select } from '@shared/ui/primitives';
import { ProdutoFormulario } from './ProdutoFormulario';

export interface AdminCatalogoPainelProps {
  produtos: Produto[];
  carregando: boolean;
  ocupado: boolean;
  erroFormulario: string | null;
  onRecarregar: () => Promise<void>;
  onCriarProduto: (input: CriarProdutoInput) => Promise<boolean>;
  onAtualizarProduto: (id: string, input: CriarProdutoInput) => Promise<boolean>;
  onAlterarEstoque: (id: string, delta: number) => Promise<void>;
  onExcluirProduto: (id: string) => Promise<void>;
}

export const AdminCatalogoPainel: React.FC<AdminCatalogoPainelProps> = ({
  produtos,
  carregando,
  ocupado,
  erroFormulario,
  onRecarregar,
  onCriarProduto,
  onAtualizarProduto,
  onAlterarEstoque,
  onExcluirProduto,
}) => {
  const [buscaLocal, setBuscaLocal] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [modoFormulario, setModoFormulario] = useState<'fechado' | 'criar' | Produto>('fechado');

  const categoriasUnicas = useMemo(() => {
    return Array.from(new Set(produtos.map((p) => p.categoria))).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    const termo = buscaLocal.trim().toLowerCase();
    return produtos.filter((p) => {
      if (filtroCategoria && p.categoria !== filtroCategoria) {
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
  }, [produtos, buscaLocal, filtroCategoria]);

  const abrirCriacao = () => setModoFormulario('criar');
  const abrirEdicao = (produto: Produto) => setModoFormulario(produto);
  const fecharFormulario = () => setModoFormulario('fechado');

  const handleSalvar = async (dados: CriarProdutoInput) => {
    const sucesso =
      modoFormulario === 'criar'
        ? await onCriarProduto(dados)
        : modoFormulario !== 'fechado'
          ? await onAtualizarProduto(modoFormulario.id, dados)
          : false;

    if (sucesso) {
      fecharFormulario();
    }
  };

  return (
    <section aria-label="Painel administrativo de itens" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-brand-black">Itens Disponíveis à Venda</h2>
          <p className="text-xs text-ink-muted">
            Gerencie o catálogo no Redis (<code>catalogo:produtos</code>,{' '}
            <code>produto:{'{id}'}</code> e índice único <code>catalogo:sku:{'{sku}'}</code>).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void onRecarregar()}
            disabled={ocupado}
          >
            Recarregar (SMEMBERS)
          </Button>
          {modoFormulario === 'fechado' ? (
            <Button variant="accent" size="sm" onClick={abrirCriacao} disabled={ocupado}>
              + Novo Produto (POST)
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={fecharFormulario}>
              ← Voltar para a lista
            </Button>
          )}
        </div>
      </div>

      {modoFormulario !== 'fechado' && (
        <ProdutoFormulario
          key={modoFormulario === 'criar' ? 'novo' : modoFormulario.id}
          produtoEdicao={modoFormulario === 'criar' ? null : modoFormulario}
          ocupado={ocupado}
          erroMensagem={erroFormulario}
          onCancelar={fecharFormulario}
          onSalvar={handleSalvar}
        />
      )}

      <Card className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          <div className="sm:col-span-7">
            <Input
              aria-label="Buscar item por nome ou código SKU"
              placeholder="Buscar item por nome ou código SKU…"
              value={buscaLocal}
              onChange={(e) => setBuscaLocal(e.target.value)}
            />
          </div>
          <div className="sm:col-span-5">
            <Select
              aria-label="Filtrar itens por categoria"
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
            >
              <option value="">Todas as categorias ({produtos.length} itens)</option>
              {categoriasUnicas.map((categoria) => (
                <option key={categoria} value={categoria}>
                  {categoria}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {carregando ? (
          <div className="py-10 text-center text-sm text-ink-muted">
            Carregando catálogo do Redis…
          </div>
        ) : produtosFiltrados.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <p className="text-xs text-ink-muted">
              Nenhum item encontrado para o filtro selecionado.
            </p>
            <Button variant="secondary" size="sm" onClick={abrirCriacao} disabled={ocupado}>
              + Novo Produto (POST)
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {produtosFiltrados.map((produto) => (
              <div
                key={produto.id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-sm text-brand-black">{produto.nome}</h3>
                    <Badge variant="neutral">{produto.sku}</Badge>
                    <Badge variant="amber">{produto.categoria}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-ink-secondary">
                    <span className="tabular-nums">
                      Varejo:{' '}
                      <strong className="text-brand-black">
                        {formatarMoeda(produto.precoVarejo)}
                      </strong>
                    </span>
                    {produto.qtAtacado !== null && (
                      <span className="text-brand-navy font-semibold tabular-nums">
                        Atacado (≥ {produto.qtAtacado} un.): {formatarMoeda(produto.precoAtacado)}
                      </span>
                    )}
                    <Badge variant={produto.estoque <= 5 ? 'danger' : 'success'}>
                      Estoque: {produto.estoque} un.
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end">
                  <div className="inline-flex items-center gap-1 mr-1">
                    <span className="text-[11px] text-ink-muted mr-0.5">HINCRBY:</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Baixar 1 do estoque de ${produto.nome}`}
                      disabled={ocupado || produto.estoque <= 0}
                      onClick={() => void onAlterarEstoque(produto.id, -1)}
                    >
                      -1
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Adicionar 1 ao estoque de ${produto.nome}`}
                      disabled={ocupado}
                      onClick={() => void onAlterarEstoque(produto.id, 1)}
                    >
                      +1
                    </Button>
                  </div>

                  <Button
                    variant="primary"
                    size="sm"
                    disabled={ocupado}
                    onClick={() => abrirEdicao(produto)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={ocupado}
                    onClick={() => void onExcluirProduto(produto.id)}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
};
