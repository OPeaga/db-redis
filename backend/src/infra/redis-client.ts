import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { ComandoAuditado, TipoOperacaoCrud } from '@projeto-cache/shared';

const ANSI_RESET = '\x1b[0m';
const ANSI_CINZA = '\x1b[90m';

const COR_OPERACAO: Record<TipoOperacaoCrud, string> = {
  INSERCAO: '\x1b[32m',
  CONSULTA: '\x1b[36m',
  ATUALIZACAO: '\x1b[33m',
  ALTERACAO: '\x1b[35m',
  EXCLUSAO: '\x1b[31m',
};

const LARGURA_TAG_OPERACAO = 11;

/**
 * Formata um comando Redis auditado com timestamp, tag de operação colorida e texto do comando para terminal.
 */
export function formatarComandoTerminal(entrada: ComandoAuditado): string {
  const data = new Date(entrada.executadoEm);
  const hora = Number.isNaN(data.getTime())
    ? entrada.executadoEm
    : data.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
  const cor = COR_OPERACAO[entrada.operacao];
  const preenchimento = ' '.repeat(Math.max(0, LARGURA_TAG_OPERACAO - entrada.operacao.length));

  return `${ANSI_CINZA}[${hora}]${ANSI_RESET} ${cor}[${entrada.operacao}]${ANSI_RESET}${preenchimento} ${entrada.comando}`;
}

export interface IRedisPipeline {
  del(chave: string): IRedisPipeline;
  hset(chave: string, dados: Record<string, string> | string, valor?: string): IRedisPipeline;
  hdel(chave: string, ...campos: string[]): IRedisPipeline;
  hincrby(chave: string, campo: string, incremento: number): IRedisPipeline;
  sadd(chave: string, ...membros: string[]): IRedisPipeline;
  srem(chave: string, ...membros: string[]): IRedisPipeline;
  expire(chave: string, segundos: number): IRedisPipeline;
  hgetall(chave: string): IRedisPipeline;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}

/**
 * Subconjunto mínimo de comandos Redis exigido pelos repositórios e pelo inspetor.
 */
export interface IRedisCliente {
  get(chave: string): Promise<string | null>;
  set(chave: string, valor: string, ...args: Array<string | number>): Promise<string | null>;
  del(...chaves: string[]): Promise<number>;
  exists(...chaves: string[]): Promise<number>;
  hget(chave: string, campo: string): Promise<string | null>;
  hgetall(chave: string): Promise<Record<string, string>>;
  hset(chave: string, dados: Record<string, string>): Promise<number>;
  hset(chave: string, campo: string, valor: string): Promise<number>;
  hdel(chave: string, ...campos: string[]): Promise<number>;
  hincrby(chave: string, campo: string, incremento: number): Promise<number>;
  sadd(chave: string, ...membros: string[]): Promise<number>;
  srem(chave: string, ...membros: string[]): Promise<number>;
  smembers(chave: string): Promise<string[]>;
  scard(chave: string): Promise<number>;
  expire(chave: string, segundos: number): Promise<number>;
  ttl(chave: string): Promise<number>;
  type(chave: string): Promise<string>;
  scan(cursor: string | number, ...args: Array<string | number>): Promise<[string, string[]]>;
  lrange(chave: string, inicio: number, fim: number): Promise<string[]>;
  flushdb(): Promise<string>;
  info(secao?: string): Promise<string>;
  ping(): Promise<string>;
  quit(): Promise<string>;
  multi(): IRedisPipeline;
  pipeline(): IRedisPipeline;
}

export type ModoConexaoRedis = 'redis-real' | 'memoria-mock';

interface ContextoCaptura {
  operacaoPadrao: TipoOperacaoCrud;
  comandos: ComandoAuditado[];
}

/**
 * Encapsula o cliente Redis registrando os comandos executados no escopo da requisição e no callback de saída.
 */
export class RastreadorRedis {
  private readonly contexto = new AsyncLocalStorage<ContextoCaptura>();

  constructor(
    readonly clienteBruto: IRedisCliente,
    readonly modoConexao: ModoConexaoRedis,
    private readonly onComando?: (entrada: ComandoAuditado) => void
  ) {}

  /**
   * Executa um bloco capturando todos os comandos auditados emitidos nele.
   */
  async capturar<T>(
    operacaoPadrao: TipoOperacaoCrud,
    fn: () => Promise<T>
  ): Promise<{ resultado: T; comandosRedis: ComandoAuditado[] }> {
    const comandos: ComandoAuditado[] = [];
    const resultado = await this.contexto.run({ operacaoPadrao, comandos }, fn);
    return { resultado, comandosRedis: comandos };
  }

  /**
   * Registra um comando textual no contexto atual e notifica o observador configurado.
   */
  registrarComando(comando: string, operacaoExplicita?: TipoOperacaoCrud): void {
    const store = this.contexto.getStore();
    const operacao = operacaoExplicita ?? store?.operacaoPadrao ?? 'CONSULTA';
    const entrada: ComandoAuditado = {
      id: randomUUID(),
      operacao,
      comando,
      executadoEm: new Date().toISOString(),
    };

    if (store) {
      store.comandos.push(entrada);
    }

    this.onComando?.(entrada);
  }

  /**
   * Executa uma ação no cliente bruto e grava o comando correspondente na trilha de auditoria.
   */
  async executar<T>(
    comando: string,
    acao: (redis: IRedisCliente) => Promise<T>,
    operacao?: TipoOperacaoCrud
  ): Promise<T> {
    const resultado = await acao(this.clienteBruto);
    this.registrarComando(comando, operacao);
    return resultado;
  }

  /**
   * Percorre todo o keyspace com SCAN sem bloquear o event loop com KEYS *.
   */
  async listarChavesPorPadrao(padrao = '*'): Promise<string[]> {
    const encontradas: string[] = [];
    let cursor = '0';

    do {
      const [proximoCursor, lote] = await this.clienteBruto.scan(
        cursor,
        'MATCH',
        padrao,
        'COUNT',
        200
      );
      encontradas.push(...lote);
      cursor = proximoCursor;
    } while (cursor !== '0');

    return Array.from(new Set(encontradas)).sort();
  }
}
