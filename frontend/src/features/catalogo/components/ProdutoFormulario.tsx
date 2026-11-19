import React, { useState } from 'react';
import type { CriarProdutoInput, Produto } from '@projeto-cache/shared';
import { Button, Card, Input } from '@shared/ui/primitives';

interface ProdutoFormularioProps {
  produtoEdicao: Produto | null;
  ocupado: boolean;
  erroMensagem: string | null;
  onCancelar: () => void;
  onSalvar: (dados: CriarProdutoInput) => Promise<void>;
}

export const ProdutoFormulario: React.FC<ProdutoFormularioProps> = ({
  produtoEdicao,
  ocupado,
  erroMensagem,
  onCancelar,
  onSalvar,
}) => {
  const [sku, setSku] = useState(produtoEdicao?.sku ?? '');
  const [nome, setNome] = useState(produtoEdicao?.nome ?? '');
  const [categoria, setCategoria] = useState(produtoEdicao?.categoria ?? 'Mercearia');
  const [precoVarejo, setPrecoVarejo] = useState(
    produtoEdicao ? String(produtoEdicao.precoVarejo) : '42.00'
  );
  const [precoAtacado, setPrecoAtacado] = useState(
    produtoEdicao ? String(produtoEdicao.precoAtacado) : '34.00'
  );
  const [qtAtacado, setQtAtacado] = useState(
    produtoEdicao?.qtAtacado ? String(produtoEdicao.qtAtacado) : '5'
  );
  const [estoque, setEstoque] = useState(produtoEdicao ? String(produtoEdicao.estoque) : '40');
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErroLocal(null);

    const varejoNum = Number(precoVarejo);
    const atacadoNum = Number(precoAtacado);
    const estoqueNum = Number.parseInt(estoque, 10);
    const qtTrim = qtAtacado.trim();
    const qtNum = qtTrim === '' ? null : Number.parseInt(qtTrim, 10);

    if (!sku.trim() || !nome.trim() || !categoria.trim()) {
      setErroLocal('Preencha SKU, nome e categoria.');
      return;
    }
    if (
      !Number.isFinite(varejoNum) ||
      varejoNum <= 0 ||
      !Number.isFinite(atacadoNum) ||
      atacadoNum <= 0
    ) {
      setErroLocal('Preços devem ser números positivos.');
      return;
    }
    if (atacadoNum > varejoNum) {
      setErroLocal('Preço de atacado não pode ser maior que o preço de varejo.');
      return;
    }
    if (qtNum !== null && (!Number.isInteger(qtNum) || qtNum < 2)) {
      setErroLocal('Quantidade mínima de atacado deve ser >= 2 (ou vazia para só varejo).');
      return;
    }
    if (!Number.isInteger(estoqueNum) || estoqueNum < 0) {
      setErroLocal('Estoque deve ser um número inteiro >= 0.');
      return;
    }

    await onSalvar({
      sku: sku.trim().toUpperCase(),
      nome: nome.trim(),
      categoria: categoria.trim(),
      precoVarejo: varejoNum,
      precoAtacado: atacadoNum,
      qtAtacado: qtNum,
      estoque: estoqueNum,
    });
  };

  const mensagemErro = erroLocal ?? erroMensagem;

  return (
    <Card className="border-2 border-brand-navy/20">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-3">
          <div>
            <h3 className="text-base font-bold text-brand-black">
              {produtoEdicao ? 'Editar produto' : 'Novo produto'}
            </h3>
            <p className="text-xs text-ink-muted">
              {produtoEdicao
                ? 'Atualize as informações e preços do produto.'
                : 'Informe um SKU único e os preços de varejo e atacado.'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancelar}>
            Fechar
          </Button>
        </div>

        {mensagemErro && (
          <div
            role="alert"
            className="rounded-md bg-danger-bg px-3 py-2 text-xs font-medium text-danger-text"
          >
            {mensagemErro}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            label="SKU (único)"
            placeholder="CHOC-1KG"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
          <div className="sm:col-span-2">
            <Input
              label="Nome do Produto"
              placeholder="Chocolate em Pó 1kg"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <Input
            label="Categoria"
            placeholder="Mercearia"
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
          />
          <Input
            label="Preço Varejo (R$)"
            type="number"
            step="0.01"
            value={precoVarejo}
            onChange={(e) => setPrecoVarejo(e.target.value)}
          />
          <Input
            label="Preço Atacado (R$)"
            type="number"
            step="0.01"
            value={precoAtacado}
            onChange={(e) => setPrecoAtacado(e.target.value)}
          />
          <Input
            label="Qtd. Mín. Atacado"
            type="number"
            min="2"
            placeholder="Opcional"
            value={qtAtacado}
            onChange={(e) => setQtAtacado(e.target.value)}
          />
          <Input
            label="Estoque (un.)"
            type="number"
            min="0"
            value={estoque}
            onChange={(e) => setEstoque(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
          <Button variant="secondary" size="sm" onClick={onCancelar} disabled={ocupado}>
            Cancelar
          </Button>
          <Button variant="accent" size="sm" type="submit" disabled={ocupado}>
            {ocupado ? 'Salvando…' : produtoEdicao ? 'Salvar alterações' : 'Cadastrar produto'}
          </Button>
        </div>
      </form>
    </Card>
  );
};
