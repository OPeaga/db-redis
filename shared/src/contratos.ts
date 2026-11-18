import { z } from 'zod';

/**
 * Identificador do único cliente usado na demonstração (carrinho `carrinho:cliente-demo`).
 */
export const CLIENTE_DEMO_ID = 'cliente-demo';

/**
 * Normaliza e valida um código SKU (letras, números, hífen e underscore, em maiúsculas).
 */
export const skuSchema = z
  .string()
  .trim()
  .min(2, 'SKU deve ter pelo menos 2 caracteres')
  .max(40, 'SKU deve ter no máximo 40 caracteres')
  .transform((valor) => valor.toUpperCase())
  .refine((valor) => /^[A-Z0-9_-]+$/.test(valor), {
    message: 'SKU deve conter apenas letras, números, hífen ou underscore',
  });

export const produtoSchema = z.object({
  id: z.string().min(1),
  sku: skuSchema,
  nome: z.string().trim().min(2).max(120),
  categoria: z.string().trim().min(2).max(60),
  precoVarejo: z.number().positive(),
  precoAtacado: z.number().positive(),
  qtAtacado: z.number().int().min(2).nullable(),
  estoque: z.number().int().min(0),
  atualizadoEm: z.string(),
});

export const criarProdutoInputSchema = z
  .object({
    sku: skuSchema,
    nome: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres').max(120),
    categoria: z.string().trim().min(2, 'Categoria obrigatória').max(60),
    precoVarejo: z.number().positive('Preço de varejo deve ser maior que zero'),
    precoAtacado: z.number().positive('Preço de atacado deve ser maior que zero'),
    qtAtacado: z.number().int().min(2, 'Quantidade mínima de atacado deve ser >= 2').nullable(),
    estoque: z.number().int().min(0, 'Estoque não pode ser negativo'),
  })
  .refine((dados) => dados.precoAtacado <= dados.precoVarejo, {
    message: 'Preço de atacado não pode ser maior que o preço de varejo',
    path: ['precoAtacado'],
  });

export const atualizarProdutoInputSchema = criarProdutoInputSchema;

export const alterarEstoquePrecoInputSchema = z
  .object({
    deltaEstoque: z.number().int().optional(),
    precoVarejo: z.number().positive('Preço de varejo deve ser maior que zero').optional(),
    precoAtacado: z.number().positive('Preço de atacado deve ser maior que zero').optional(),
    qtAtacado: z
      .number()
      .int()
      .min(2, 'Quantidade mínima de atacado deve ser >= 2')
      .nullable()
      .optional(),
  })
  .refine(
    (dados) =>
      dados.deltaEstoque !== undefined ||
      dados.precoVarejo !== undefined ||
      dados.precoAtacado !== undefined ||
      dados.qtAtacado !== undefined,
    { message: 'Informe pelo menos um campo para alteração parcial' }
  );

export const modalidadePrecoSchema = z.enum(['VAREJO', 'ATACADO']);

export const itemCarrinhoDetalhadoSchema = z.object({
  produtoId: z.string().min(1),
  sku: z.string().min(1),
  nome: z.string().min(1),
  quantidade: z.number().int().positive(),
  estoqueDisponivel: z.number().int().min(0),
  qtAtacado: z.number().int().min(2).nullable(),
  precoVarejo: z.number().positive(),
  precoAtacado: z.number().positive(),
  modalidadeAplicada: modalidadePrecoSchema,
  precoUnitarioAplicado: z.number().positive(),
  subtotal: z.number().nonnegative(),
  economiaAtacado: z.number().nonnegative(),
});

export const carrinhoDetalhadoSchema = z.object({
  clienteId: z.string().min(1),
  chaveRedis: z.string().min(1),
  ttlSegundos: z.number().int(),
  totalUnidades: z.number().int().nonnegative(),
  totalBrutoVarejo: z.number().nonnegative(),
  economiaTotalAtacado: z.number().nonnegative(),
  totalFinal: z.number().nonnegative(),
  itens: z.array(itemCarrinhoDetalhadoSchema),
});

export const definirItemCarrinhoInputSchema = z.object({
  quantidade: z.number().int().min(0, 'Quantidade não pode ser negativa'),
});

export const incrementarItemCarrinhoInputSchema = z.object({
  delta: z
    .number()
    .int()
    .refine((v) => v !== 0, 'Delta não pode ser zero'),
});

export const atualizarTtlCarrinhoInputSchema = z.object({
  ttlSegundos: z
    .number()
    .int()
    .min(1, 'TTL mínimo é 1 segundo')
    .max(86400, 'TTL máximo é 86400 segundos (24h)'),
});

export const tipoOperacaoCrudSchema = z.enum([
  'INSERCAO',
  'CONSULTA',
  'ATUALIZACAO',
  'ALTERACAO',
  'EXCLUSAO',
]);

export const comandoAuditadoSchema = z.object({
  id: z.string().min(1),
  operacao: tipoOperacaoCrudSchema,
  comando: z.string().min(1),
  executadoEm: z.string(),
});

export const tipoChaveRedisSchema = z.enum([
  'hash',
  'set',
  'string',
  'list',
  'zset',
  'none',
  'outro',
]);

export const chaveInspecionadaSchema = z.object({
  chave: z.string().min(1),
  tipo: tipoChaveRedisSchema,
  ttlSegundos: z.number().int(),
  valor: z.union([z.string(), z.array(z.string()), z.record(z.string(), z.string())]),
});

export const estadoRedisSchema = z.object({
  modoConexao: z.enum(['redis-real', 'memoria-mock']),
  totalChaves: z.number().int().nonnegative(),
  memoriaUsadaLegivel: z.string(),
  chaves: z.array(chaveInspecionadaSchema),
  auditoria: z.array(comandoAuditadoSchema),
});

export function criarEnvelopeOperacaoSchema<T extends z.ZodTypeAny>(dadosSchema: T) {
  return z.object({
    dados: dadosSchema,
    comandosRedis: z.array(comandoAuditadoSchema),
  });
}

export const erroApiSchema = z.object({
  codigo: z.string().min(1),
  mensagem: z.string().min(1),
  detalhes: z.unknown().optional(),
});

export type Produto = z.infer<typeof produtoSchema>;
export type CriarProdutoInput = z.infer<typeof criarProdutoInputSchema>;
export type AtualizarProdutoInput = z.infer<typeof atualizarProdutoInputSchema>;
export type AlterarEstoquePrecoInput = z.infer<typeof alterarEstoquePrecoInputSchema>;
export type ModalidadePreco = z.infer<typeof modalidadePrecoSchema>;
export type ItemCarrinhoDetalhado = z.infer<typeof itemCarrinhoDetalhadoSchema>;
export type CarrinhoDetalhado = z.infer<typeof carrinhoDetalhadoSchema>;
export type DefinirItemCarrinhoInput = z.infer<typeof definirItemCarrinhoInputSchema>;
export type IncrementarItemCarrinhoInput = z.infer<typeof incrementarItemCarrinhoInputSchema>;
export type AtualizarTtlCarrinhoInput = z.infer<typeof atualizarTtlCarrinhoInputSchema>;
export type TipoOperacaoCrud = z.infer<typeof tipoOperacaoCrudSchema>;
export type ComandoAuditado = z.infer<typeof comandoAuditadoSchema>;
export type TipoChaveRedis = z.infer<typeof tipoChaveRedisSchema>;
export type ChaveInspecionada = z.infer<typeof chaveInspecionadaSchema>;
export type EstadoRedis = z.infer<typeof estadoRedisSchema>;
export type ErroApi = z.infer<typeof erroApiSchema>;

export interface EnvelopeOperacao<T> {
  dados: T;
  comandosRedis: ComandoAuditado[];
}
