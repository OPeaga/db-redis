import { construirAplicacao } from './app.js';
import { criarConexaoRedis } from './infra/redis-factory.js';

const PORTA = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

async function iniciar(): Promise<void> {
  const { cliente, modoConexao } = await criarConexaoRedis();
  const { app, catalogoService, carrinhoService } = await construirAplicacao({
    redisCliente: cliente,
    modoConexao,
  });

  const populouCatalogo = await catalogoService.popularSeedSeVazio();
  if (populouCatalogo) {
    await carrinhoService.popularCarrinhoDemo();
  }

  const encerrar = async () => {
    await app.close();
    await cliente.quit();
    process.exit(0);
  };

  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);

  await app.listen({ port: PORTA, host: HOST });
  console.log(`[API] Servidor ouvindo em http://localhost:${PORTA} (Redis: ${modoConexao})`);
}

iniciar().catch((erro) => {
  console.error('[API] Falha fatal ao iniciar servidor:', erro);
  process.exit(1);
});
