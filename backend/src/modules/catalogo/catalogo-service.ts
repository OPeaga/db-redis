import { randomUUID } from 'node:crypto';
import {
  alterarEstoquePrecoInputSchema,
  atualizarProdutoInputSchema,
  criarProdutoInputSchema,
  type AlterarEstoquePrecoInput,
  type AtualizarProdutoInput,
  type CriarProdutoInput,
  type Produto,
} from '@projeto-cache/shared';
import { ErroDominio } from '../../infra/erros.js';
import type { ICatalogoRepository } from './catalogo-repository.js';
import { PRODUTOS_SEED } from './catalogo-seed.js';

export class CatalogoService {
  constructor(private readonly repository: ICatalogoRepository) {}

  async listarProdutos(): Promise<Produto[]> {
    return this.repository.listarTodos();
  }

  async obterProduto(id: string): Promise<Produto> {
    const produto = await this.repository.buscarPorId(id);
    if (!produto) {
      throw new ErroDominio(
        'not_found',
        'PRODUTO_NAO_ENCONTRADO',
        `Produto "${id}" não encontrado`
      );
    }
    return produto;
  }

  async criarProduto(entradaBruta: CriarProdutoInput): Promise<Produto> {
    const entrada = criarProdutoInputSchema.parse(entradaBruta);
    const id = `prod-${randomUUID().slice(0, 8)}`;

    const reservado = await this.repository.reservarSkuUnico(entrada.sku, id);
    if (!reservado) {
      throw new ErroDominio(
        'conflict',
        'SKU_DUPLICADO',
        `Já existe um produto cadastrado com o SKU "${entrada.sku}"`
      );
    }

    const produto: Produto = {
      id,
      sku: entrada.sku,
      nome: entrada.nome,
      categoria: entrada.categoria,
      precoVarejo: Number(entrada.precoVarejo.toFixed(2)),
      precoAtacado: Number(entrada.precoAtacado.toFixed(2)),
      qtAtacado: entrada.qtAtacado,
      estoque: entrada.estoque,
      atualizadoEm: new Date().toISOString(),
    };

    try {
      await this.repository.inserir(produto);
    } catch (erro) {
      await this.repository.liberarSku(entrada.sku);
      throw erro;
    }
    return produto;
  }

  async atualizarProduto(id: string, entradaBruta: AtualizarProdutoInput): Promise<Produto> {
    const entrada = atualizarProdutoInputSchema.parse(entradaBruta);
    const existente = await this.obterProduto(id);

    const trocouSku = entrada.sku !== existente.sku;
    if (trocouSku) {
      const reservado = await this.repository.reservarSkuUnico(entrada.sku, id);
      if (!reservado) {
        throw new ErroDominio(
          'conflict',
          'SKU_DUPLICADO',
          `O SKU "${entrada.sku}" já pertence a outro produto`
        );
      }
    }

    const atualizado: Produto = {
      id,
      sku: entrada.sku,
      nome: entrada.nome,
      categoria: entrada.categoria,
      precoVarejo: Number(entrada.precoVarejo.toFixed(2)),
      precoAtacado: Number(entrada.precoAtacado.toFixed(2)),
      qtAtacado: entrada.qtAtacado,
      estoque: entrada.estoque,
      atualizadoEm: new Date().toISOString(),
    };

    try {
      await this.repository.atualizarCompleto(atualizado);
    } catch (erro) {
      if (trocouSku) {
        await this.repository.liberarSku(entrada.sku);
      }
      throw erro;
    }

    if (trocouSku) {
      await this.repository.liberarSku(existente.sku);
    }
    return atualizado;
  }

  async alterarParcialProduto(
    id: string,
    entradaBruta: AlterarEstoquePrecoInput
  ): Promise<Produto> {
    const entrada = alterarEstoquePrecoInputSchema.parse(entradaBruta);
    const existente = await this.obterProduto(id);

    const novoEstoque =
      entrada.deltaEstoque !== undefined
        ? existente.estoque + entrada.deltaEstoque
        : existente.estoque;
    if (novoEstoque < 0) {
      throw new ErroDominio(
        'invalid',
        'ESTOQUE_INSUFICIENTE',
        `Estoque não pode ficar negativo (atual: ${existente.estoque}, delta: ${entrada.deltaEstoque})`
      );
    }

    const novoPrecoVarejo = entrada.precoVarejo ?? existente.precoVarejo;
    const novoPrecoAtacado = entrada.precoAtacado ?? existente.precoAtacado;
    if (novoPrecoAtacado > novoPrecoVarejo) {
      throw new ErroDominio(
        'invalid',
        'PRECO_ATACADO_INVALIDO',
        'Preço de atacado não pode ultrapassar o preço de varejo'
      );
    }

    const agora = new Date().toISOString();
    let estoqueFinal = existente.estoque;

    if (entrada.deltaEstoque !== undefined && entrada.deltaEstoque !== 0) {
      estoqueFinal = await this.repository.incrementarEstoque(id, entrada.deltaEstoque, agora);
    }

    const camposParciais: Record<string, string> = {};
    if (entrada.precoVarejo !== undefined) {
      camposParciais.preco_varejo = entrada.precoVarejo.toFixed(2);
    }
    if (entrada.precoAtacado !== undefined) {
      camposParciais.preco_atacado = entrada.precoAtacado.toFixed(2);
    }
    if (entrada.qtAtacado !== undefined) {
      camposParciais.qt_atacado = entrada.qtAtacado === null ? '' : String(entrada.qtAtacado);
    }

    if (Object.keys(camposParciais).length > 0) {
      camposParciais.atualizado_em = agora;
      await this.repository.atualizarCamposParciais(id, camposParciais);
    }

    return {
      ...existente,
      estoque: estoqueFinal,
      precoVarejo: Number(novoPrecoVarejo.toFixed(2)),
      precoAtacado: Number(novoPrecoAtacado.toFixed(2)),
      qtAtacado: entrada.qtAtacado !== undefined ? entrada.qtAtacado : existente.qtAtacado,
      atualizadoEm: agora,
    };
  }

  async excluirProduto(id: string): Promise<{ id: string }> {
    const existente = await this.obterProduto(id);
    await this.repository.excluir(existente);
    return { id };
  }

  async popularSeedSeVazio(): Promise<boolean> {
    const total = await this.repository.contarProdutosSemAuditoria();
    if (total > 0) {
      return false;
    }

    const agora = new Date().toISOString();
    for (const item of PRODUTOS_SEED) {
      await this.repository.inserirSeedDireto({
        ...item,
        atualizadoEm: agora,
      });
    }
    return true;
  }
}
