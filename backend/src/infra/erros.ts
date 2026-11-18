import { ZodError } from 'zod';
import type { ErroApi } from '@projeto-cache/shared';

export type TipoErroDominio = 'invalid' | 'not_found' | 'conflict';

/**
 * Erro semântico de domínio independente da camada HTTP.
 */
export class ErroDominio extends Error {
  constructor(
    readonly tipo: TipoErroDominio,
    readonly codigo: string,
    readonly mensagem: string,
    readonly detalhes?: unknown
  ) {
    super(mensagem);
    this.name = 'ErroDominio';
  }
}

const STATUS_POR_TIPO: Record<TipoErroDominio, number> = {
  invalid: 400,
  not_found: 404,
  conflict: 409,
};

/**
 * Converte erros de domínio ou validação Zod no contrato HTTP padronizado.
 */
export function traduzirErroParaHttp(erro: unknown): { status: number; corpo: ErroApi } {
  if (erro instanceof ErroDominio) {
    return {
      status: STATUS_POR_TIPO[erro.tipo],
      corpo: {
        codigo: erro.codigo,
        mensagem: erro.mensagem,
        ...(erro.detalhes !== undefined ? { detalhes: erro.detalhes } : {}),
      },
    };
  }

  if (erro instanceof ZodError) {
    return {
      status: 400,
      corpo: {
        codigo: 'DADOS_INVALIDOS',
        mensagem: erro.issues[0]?.message ?? 'Dados de entrada inválidos',
        detalhes: erro.issues,
      },
    };
  }

  return {
    status: 500,
    corpo: {
      codigo: 'ERRO_INTERNO',
      mensagem: 'Falha inesperada ao processar operação no Redis',
    },
  };
}
