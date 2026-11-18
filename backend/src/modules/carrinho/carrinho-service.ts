import {
  CLIENTE_DEMO_ID,
  atualizarTtlCarrinhoInputSchema,
  definirItemCarrinhoInputSchema,
  incrementarItemCarrinhoInputSchema,
  type CarrinhoDetalhado,
  type ItemCarrinhoDetalhado,
  type ModalidadePreco,
} from '@projeto-cache/shared';
import { ErroDominio } from '../../infra/erros.js';
import type { ICatalogoRepository } from '../catalogo/catalogo-repository.js';
import { chaveCarrinho, type ICarrinhoRepository } from './carrinho-repository.js';
import { ITENS_CARRINHO_SEED, TTL_CARRINHO_PADRAO_SEGUNDOS } from './carrinho-seed.js';

function arredondarMoeda(valor: number): number {
  return Number(valor.toFixed(2));
}

export class CarrinhoService {
  constructor(
    private readonly carrinhoRepo: ICarrinhoRepository,
    private readonly catalogoRepo: ICatalogoRepository
  ) {}

  async obterCarrinho(clienteId: string): Promise<CarrinhoDetalhado> {
    const { itens: mapaItens, ttlSegundos } = await this.carrinhoRepo.obterItensETtl(clienteId);
    const itensDetalhados: ItemCarrinhoDetalhado[] = [];

    for (const [produtoId, quantidade] of Object.entries(mapaItens)) {
      const produto = await this.catalogoRepo.buscarPorId(produtoId);
      if (!produto) {
        continue;
      }

      const atacadoAtivo = produto.qtAtacado !== null && quantidade >= produto.qtAtacado;
      const modalidadeAplicada: ModalidadePreco = atacadoAtivo ? 'ATACADO' : 'VAREJO';
      const precoUnitarioAplicado = atacadoAtivo ? produto.precoAtacado : produto.precoVarejo;
      const subtotal = arredondarMoeda(quantidade * precoUnitarioAplicado);
      const economiaAtacado = arredondarMoeda(
        (produto.precoVarejo - precoUnitarioAplicado) * quantidade
      );

      itensDetalhados.push({
        produtoId: produto.id,
        sku: produto.sku,
        nome: produto.nome,
        quantidade,
        estoqueDisponivel: produto.estoque,
        qtAtacado: produto.qtAtacado,
        precoVarejo: produto.precoVarejo,
        precoAtacado: produto.precoAtacado,
        modalidadeAplicada,
        precoUnitarioAplicado,
        subtotal,
        economiaAtacado,
      });
    }

    itensDetalhados.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    const totalUnidades = itensDetalhados.reduce((acc, item) => acc + item.quantidade, 0);
    const totalBrutoVarejo = arredondarMoeda(
      itensDetalhados.reduce((acc, item) => acc + item.quantidade * item.precoVarejo, 0)
    );
    const totalFinal = arredondarMoeda(
      itensDetalhados.reduce((acc, item) => acc + item.subtotal, 0)
    );
    const economiaTotalAtacado = arredondarMoeda(totalBrutoVarejo - totalFinal);

    return {
      clienteId,
      chaveRedis: chaveCarrinho(clienteId),
      ttlSegundos,
      totalUnidades,
      totalBrutoVarejo,
      economiaTotalAtacado,
      totalFinal,
      itens: itensDetalhados,
    };
  }

  async definirItem(
    clienteId: string,
    produtoId: string,
    entradaBruta: { quantidade: number }
  ): Promise<CarrinhoDetalhado> {
    const { quantidade } = definirItemCarrinhoInputSchema.parse(entradaBruta);
    const produto = await this.catalogoRepo.buscarPorId(produtoId);
    if (!produto) {
      throw new ErroDominio(
        'not_found',
        'PRODUTO_NAO_ENCONTRADO',
        `Produto "${produtoId}" não existe no catálogo`
      );
    }

    if (quantidade === 0) {
      await this.carrinhoRepo.removerItem(clienteId, produtoId);
      return this.obterCarrinho(clienteId);
    }

    if (quantidade > produto.estoque) {
      throw new ErroDominio(
        'invalid',
        'ESTOQUE_INSUFICIENTE',
        `Estoque disponível para "${produto.nome}" é de ${produto.estoque} unidade(s)`
      );
    }

    await this.carrinhoRepo.definirQuantidade(
      clienteId,
      produtoId,
      quantidade,
      TTL_CARRINHO_PADRAO_SEGUNDOS
    );
    return this.obterCarrinho(clienteId);
  }

  async alterarQuantidade(
    clienteId: string,
    produtoId: string,
    entradaBruta: { delta: number }
  ): Promise<CarrinhoDetalhado> {
    const { delta } = incrementarItemCarrinhoInputSchema.parse(entradaBruta);
    const produto = await this.catalogoRepo.buscarPorId(produtoId);
    if (!produto) {
      throw new ErroDominio(
        'not_found',
        'PRODUTO_NAO_ENCONTRADO',
        `Produto "${produtoId}" não existe no catálogo`
      );
    }

    const quantidadeAtual = await this.carrinhoRepo.obterQuantidadeItem(clienteId, produtoId);
    if (quantidadeAtual === 0 && delta < 0) {
      throw new ErroDominio(
        'not_found',
        'ITEM_NAO_ENCONTRADO',
        'Item não está presente no carrinho'
      );
    }

    const proximaQuantidade = quantidadeAtual + delta;
    if (proximaQuantidade <= 0) {
      await this.carrinhoRepo.removerItem(clienteId, produtoId);
      return this.obterCarrinho(clienteId);
    }

    if (proximaQuantidade > produto.estoque) {
      throw new ErroDominio(
        'invalid',
        'ESTOQUE_INSUFICIENTE',
        `Limite de estoque atingido (${produto.estoque} unidade(s))`
      );
    }

    await this.carrinhoRepo.incrementarQuantidade(
      clienteId,
      produtoId,
      delta,
      TTL_CARRINHO_PADRAO_SEGUNDOS
    );
    return this.obterCarrinho(clienteId);
  }

  async atualizarTtl(
    clienteId: string,
    entradaBruta: { ttlSegundos: number }
  ): Promise<CarrinhoDetalhado> {
    const { ttlSegundos } = atualizarTtlCarrinhoInputSchema.parse(entradaBruta);
    const atualizado = await this.carrinhoRepo.atualizarTtl(clienteId, ttlSegundos);
    if (!atualizado) {
      throw new ErroDominio(
        'not_found',
        'CARRINHO_VAZIO_OU_EXPIRADO',
        'Não é possível ajustar TTL de um carrinho vazio ou já expirado no Redis'
      );
    }
    return this.obterCarrinho(clienteId);
  }

  async removerItem(clienteId: string, produtoId: string): Promise<CarrinhoDetalhado> {
    const removido = await this.carrinhoRepo.removerItem(clienteId, produtoId);
    if (!removido) {
      throw new ErroDominio(
        'not_found',
        'ITEM_NAO_ENCONTRADO',
        `Item "${produtoId}" não encontrado no carrinho`
      );
    }
    return this.obterCarrinho(clienteId);
  }

  async limparCarrinho(clienteId: string): Promise<CarrinhoDetalhado> {
    await this.carrinhoRepo.limpar(clienteId);
    return this.obterCarrinho(clienteId);
  }

  async popularCarrinhoDemo(): Promise<void> {
    await this.carrinhoRepo.inserirSeedDireto(
      CLIENTE_DEMO_ID,
      ITENS_CARRINHO_SEED,
      TTL_CARRINHO_PADRAO_SEGUNDOS
    );
  }
}
