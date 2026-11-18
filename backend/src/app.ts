import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { traduzirErroParaHttp } from './infra/erros.js';
import {
  RastreadorRedis,
  type IRedisCliente,
  type ModoConexaoRedis,
} from './infra/redis-client.js';
import { CatalogoRedisRepository } from './modules/catalogo/catalogo-repository.js';
import { CatalogoService } from './modules/catalogo/catalogo-service.js';
import { registrarRotasCatalogo } from './modules/catalogo/catalogo-controller.js';
import { CarrinhoRedisRepository } from './modules/carrinho/carrinho-repository.js';
import { CarrinhoService } from './modules/carrinho/carrinho-service.js';
import { registrarRotasCarrinho } from './modules/carrinho/carrinho-controller.js';
import { InspecaoService } from './modules/inspecao/inspecao-service.js';
import { registrarRotasInspecao } from './modules/inspecao/inspecao-controller.js';

export interface DependenciasApp {
  redisCliente: IRedisCliente;
  modoConexao: ModoConexaoRedis;
}

export interface InstanciaAplicacao {
  app: FastifyInstance;
  catalogoService: CatalogoService;
  carrinhoService: CarrinhoService;
  inspecaoService: InspecaoService;
  rastreador: RastreadorRedis;
}

/**
 * Raiz de composição do backend: instancia repositórios Redis, serviços e rotas HTTP.
 */
export async function construirAplicacao(deps: DependenciasApp): Promise<InstanciaAplicacao> {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.setErrorHandler((erro, _request, reply) => {
    const { status, corpo } = traduzirErroParaHttp(erro);
    return reply.status(status).send(corpo);
  });

  const rastreador = new RastreadorRedis(deps.redisCliente, deps.modoConexao);

  const catalogoRepo = new CatalogoRedisRepository(rastreador);
  const carrinhoRepo = new CarrinhoRedisRepository(rastreador);

  const catalogoService = new CatalogoService(catalogoRepo);
  const carrinhoService = new CarrinhoService(carrinhoRepo, catalogoRepo);
  const inspecaoService = new InspecaoService(rastreador, catalogoService, carrinhoService);

  app.get('/api/health', async () => ({
    ok: true,
    modoConexao: deps.modoConexao,
  }));

  registrarRotasCatalogo(app, catalogoService, rastreador);
  registrarRotasCarrinho(app, carrinhoService, rastreador);
  registrarRotasInspecao(app, inspecaoService, rastreador);

  return {
    app,
    catalogoService,
    carrinhoService,
    inspecaoService,
    rastreador,
  };
}
