import { z } from 'zod';
import { comandoAuditadoSchema, erroApiSchema, type EnvelopeOperacao } from '@projeto-cache/shared';
import { ApiError, statusParaKind } from './api-error';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

const envelopeBrutoSchema = z.object({
  dados: z.unknown(),
  comandosRedis: z.array(comandoAuditadoSchema),
});

export interface OpcoesRequisicao {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
}

/**
 * Cliente HTTP único do front-end: centraliza base URL, headers, validação Zod e erros tipados.
 */
export async function httpRequest<T>(
  caminho: string,
  schemaDados: z.ZodType<T>,
  opcoes: OpcoesRequisicao = {}
): Promise<EnvelopeOperacao<T>> {
  const url = `${BASE_URL}${caminho}`;
  let resposta: Response;

  try {
    resposta = await fetch(url, {
      method: opcoes.method ?? 'GET',
      headers: {
        ...(opcoes.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opcoes.body !== undefined ? JSON.stringify(opcoes.body) : undefined,
    });
  } catch {
    throw new ApiError(
      'network',
      'FALHA_CONEXAO',
      'Não foi possível conectar ao servidor backend. Verifique se a API está em execução.'
    );
  }

  let jsonBruto: unknown;
  try {
    jsonBruto = await resposta.json();
  } catch {
    throw new ApiError(
      'unexpected',
      'RESPOSTA_INVALIDA',
      'Resposta inválida recebida do servidor',
      resposta.status
    );
  }

  if (!resposta.ok) {
    const erroValidado = erroApiSchema.safeParse(jsonBruto);
    if (erroValidado.success) {
      throw new ApiError(
        statusParaKind(resposta.status),
        erroValidado.data.codigo,
        erroValidado.data.mensagem,
        resposta.status
      );
    }
    throw new ApiError(
      statusParaKind(resposta.status),
      'ERRO_HTTP',
      `Erro HTTP ${resposta.status}`,
      resposta.status
    );
  }

  const envelopeValidado = envelopeBrutoSchema.safeParse(jsonBruto);
  if (!envelopeValidado.success) {
    throw new ApiError(
      'unexpected',
      'CONTRATO_VIOLADO',
      'A resposta da API não corresponde ao envelope esperado',
      resposta.status
    );
  }

  const dadosValidados = schemaDados.safeParse(envelopeValidado.data.dados);
  if (!dadosValidados.success) {
    throw new ApiError(
      'unexpected',
      'CONTRATO_VIOLADO',
      'Os dados retornados pela API não correspondem ao contrato esperado',
      resposta.status
    );
  }

  return {
    dados: dadosValidados.data,
    comandosRedis: envelopeValidado.data.comandosRedis,
  };
}
