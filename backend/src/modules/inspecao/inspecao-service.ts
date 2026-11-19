import type { ChaveInspecionada, EstadoRedis, TipoChaveRedis } from '@projeto-cache/shared';
import type { RastreadorRedis } from '../../infra/redis-client.js';
import type { CarrinhoService } from '../carrinho/carrinho-service.js';
import type { CatalogoService } from '../catalogo/catalogo-service.js';

function normalizarTipoChave(tipoBruto: string): TipoChaveRedis {
  switch (tipoBruto.toLowerCase()) {
    case 'hash':
    case 'set':
    case 'string':
    case 'list':
    case 'zset':
    case 'none':
      return tipoBruto.toLowerCase() as TipoChaveRedis;
    default:
      return 'outro';
  }
}

function prioridadeChave(chave: string): number {
  if (chave.startsWith('carrinho:')) return 0;
  if (chave === 'catalogo:produtos') return 1;
  if (chave.startsWith('catalogo:sku:')) return 2;
  if (chave.startsWith('produto:')) return 3;
  return 4;
}

export class InspecaoService {
  constructor(
    private readonly rastreador: RastreadorRedis,
    private readonly catalogoService: CatalogoService,
    private readonly carrinhoService: CarrinhoService
  ) {}

  async obterEstado(): Promise<EstadoRedis> {
    const cliente = this.rastreador.clienteBruto;
    const todasChaves = await this.rastreador.listarChavesPorPadrao('*');
    todasChaves.sort((a, b) => {
      const diff = prioridadeChave(a) - prioridadeChave(b);
      return diff !== 0 ? diff : a.localeCompare(b, 'pt-BR');
    });

    const chavesInspecionadas: ChaveInspecionada[] = [];

    for (const chave of todasChaves) {
      const tipo = normalizarTipoChave(await cliente.type(chave));
      if (tipo === 'none') {
        continue;
      }

      const ttlSegundos = await cliente.ttl(chave);
      let valor: ChaveInspecionada['valor'] = '';

      if (tipo === 'hash') {
        valor = await cliente.hgetall(chave);
      } else if (tipo === 'set') {
        valor = (await cliente.smembers(chave)).sort();
      } else if (tipo === 'string') {
        valor = (await cliente.get(chave)) ?? '';
      } else if (tipo === 'list') {
        valor = await cliente.lrange(chave, 0, 14);
      }

      chavesInspecionadas.push({
        chave,
        tipo,
        ttlSegundos,
        valor,
      });
    }

    const memoriaUsadaLegivel = await this.lerMemoriaUsada();

    return {
      modoConexao: this.rastreador.modoConexao,
      totalChaves: chavesInspecionadas.length,
      memoriaUsadaLegivel,
      chaves: chavesInspecionadas,
      auditoria: [],
    };
  }

  async resetarParaSeed(): Promise<EstadoRedis> {
    await this.rastreador.clienteBruto.flushdb();
    await this.catalogoService.popularSeedSeVazio();
    await this.carrinhoService.popularCarrinhoDemo();
    this.rastreador.registrarComando(
      'FLUSHDB -> SEED (6 produtos + carrinho:cliente-demo TTL 1800s)',
      'INSERCAO'
    );
    return this.obterEstado();
  }

  private async lerMemoriaUsada(): Promise<string> {
    if (this.rastreador.modoConexao === 'memoria-mock') {
      return 'Em memória (mock)';
    }

    try {
      const info = await this.rastreador.clienteBruto.info('memory');
      const match = info.match(/used_memory_human:([^\r\n]+)/);
      return match ? match[1].trim() : 'Indisponível';
    } catch {
      return 'Indisponível';
    }
  }
}
