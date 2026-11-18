export type KindErroApi = 'invalid' | 'not_found' | 'conflict' | 'network' | 'unexpected';

/**
 * Erro tipado retornado pelo cliente HTTP após traduzir status e payload do backend.
 */
export class ApiError extends Error {
  constructor(
    readonly kind: KindErroApi,
    readonly codigo: string,
    readonly mensagem: string,
    readonly status?: number
  ) {
    super(mensagem);
    this.name = 'ApiError';
  }
}

export function statusParaKind(status: number): KindErroApi {
  if (status === 400 || status === 422) return 'invalid';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  return 'unexpected';
}
