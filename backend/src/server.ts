import { construirAplicacao } from './app.js';
import { criarConexaoRedis } from './infra/redis-factory.js';

const PORTA = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

async function iniciar(): Promise<void> {
  const { cliente, modoConexao } = await criarConexaoRedis();
  const logarComandosNoTerminal = process.env.LOG_REDIS_COMMANDS !== 'false';
  const { app, catalogoService, carrinhoService } = await construirAplicacao({
    redisCliente: cliente,
    modoConexao,
    logarComandosNoTerminal,
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
  console.log('[API] Redis Insight (UI): http://localhost:5540');
  if (logarComandosNoTerminal) {
    console.log('[API] Comandos Redis exibidos abaixo em tempo real:');
  }
}

iniciar().catch((erro) => {
  console.error('[API] Falha fatal ao iniciar servidor:', erro);
  process.exit(1);
});
