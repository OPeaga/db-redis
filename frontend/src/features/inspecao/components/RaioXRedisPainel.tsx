import React, { useMemo, useState } from 'react';
import type {
  ChaveInspecionada,
  ComandoAuditado,
  EstadoRedis,
  TipoOperacaoCrud,
} from '@projeto-cache/shared';
import { formatarHora, formatarTtl } from '@shared/lib/formatadores';
import { Badge, Button, Card, type BadgeVariant } from '@shared/ui/primitives';

export interface RaioXRedisPainelProps {
  estado: EstadoRedis | null;
  ultimosComandos: ComandoAuditado[];
  ocupado: boolean;
  onAtualizar: () => Promise<void>;
  onResetarSeed: () => Promise<void>;
}

const VARIANTE_OPERACAO: Record<TipoOperacaoCrud, BadgeVariant> = {
  INSERCAO: 'success',
  CONSULTA: 'info',
  ATUALIZACAO: 'amber',
  ALTERACAO: 'navy',
  EXCLUSAO: 'danger',
};

type AbaRaioX = 'comandos' | 'keyspace';
type FiltroPrefixo = 'todos' | 'carrinho:' | 'produto:' | 'catalogo:';

function renderValorChave(chave: ChaveInspecionada): React.ReactNode {
  if (typeof chave.valor === 'string') {
    return (
      <div className="rounded bg-bg-muted px-2.5 py-1.5 font-mono text-[11px] text-brand-black break-all">
        &quot;{chave.valor}&quot;
      </div>
    );
  }

  if (Array.isArray(chave.valor)) {
    if (chave.valor.length === 0) {
      return <span className="text-xs text-ink-muted">(vazio)</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {chave.valor.map((item, idx) => (
          <span
            key={`${chave.chave}-${idx}`}
            className="rounded bg-bg-muted px-2 py-0.5 font-mono text-[11px] text-brand-navy break-all"
          >
            {item}
          </span>
        ))}
      </div>
    );
  }

  const entradas = Object.entries(chave.valor);
  if (entradas.length === 0) {
    return <span className="text-xs text-ink-muted">(hash vazio)</span>;
  }

  return (
    <div className="grid grid-cols-1 gap-1 rounded bg-bg-muted/70 p-2 font-mono text-[11px]">
      {entradas.map(([campo, valor]) => (
        <div
          key={campo}
          className="flex items-baseline justify-between gap-2 border-b border-black/5 pb-0.5 last:border-b-0 last:pb-0"
        >
          <span className="font-semibold text-brand-navy break-all">{campo}</span>
          <span className="text-brand-black break-all text-right">{valor}</span>
        </div>
      ))}
    </div>
  );
}

export const RaioXRedisPainel: React.FC<RaioXRedisPainelProps> = ({
  estado,
  ultimosComandos,
  ocupado,
  onAtualizar,
  onResetarSeed,
}) => {
  const [abaInterna, setAbaInterna] = useState<AbaRaioX>('comandos');
  const [filtro, setFiltro] = useState<FiltroPrefixo>('todos');

  const idsRecentes = useMemo(
    () => new Set(ultimosComandos.map((cmd) => cmd.id)),
    [ultimosComandos]
  );

  const chavesFiltradas = useMemo(() => {
    const lista = estado?.chaves ?? [];
    if (filtro === 'todos') return lista;
    return lista.filter((c) => c.chave.startsWith(filtro));
  }, [estado, filtro]);

  const comandosExibidos = useMemo(() => {
    if (estado?.auditoria && estado.auditoria.length > 0) {
      return estado.auditoria;
    }
    return ultimosComandos;
  }, [estado, ultimosComandos]);

  return (
    <aside aria-label="Raio-X do Redis">
      <Card className="p-0 overflow-hidden border-brand-navy/25">
        <div className="bg-brand-navy text-white p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-brand-amber">Raio-X do Redis</h2>
            <Badge variant={estado?.modoConexao === 'redis-real' ? 'success' : 'amber'}>
              {estado?.modoConexao === 'redis-real' ? 'Redis Real (:6379)' : 'Memória Mock'}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-white/80 tabular-nums">
              <strong className="text-white">{estado?.totalChaves ?? 0}</strong> chaves ativas •
              Memória:{' '}
              <strong className="text-brand-amber">{estado?.memoriaUsadaLegivel ?? '...'}</strong>
            </span>

            <div className="flex items-center gap-1.5">
              <Button
                variant="accent"
                size="sm"
                onClick={() => void onAtualizar()}
                disabled={ocupado}
              >
                Atualizar
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void onResetarSeed()}
                disabled={ocupado}
              >
                Resetar Seed
              </Button>
            </div>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Visualização do Raio-X Redis"
          className="grid grid-cols-2 border-b border-border-subtle bg-bg-muted/60"
        >
          <button
            type="button"
            role="tab"
            aria-selected={abaInterna === 'comandos'}
            onClick={() => setAbaInterna('comandos')}
            className={`px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer border-b-2 ${
              abaInterna === 'comandos'
                ? 'border-brand-amber bg-bg-surface text-brand-navy'
                : 'border-transparent text-ink-muted hover:text-brand-navy'
            }`}
          >
            Comandos ({comandosExibidos.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={abaInterna === 'keyspace'}
            onClick={() => setAbaInterna('keyspace')}
            className={`px-3 py-2.5 text-xs font-semibold transition-colors cursor-pointer border-b-2 ${
              abaInterna === 'keyspace'
                ? 'border-brand-amber bg-bg-surface text-brand-navy'
                : 'border-transparent text-ink-muted hover:text-brand-navy'
            }`}
          >
            Keyspace ({estado?.chaves.length ?? 0})
          </button>
        </div>

        {abaInterna === 'comandos' ? (
          <div role="tabpanel" aria-label="Comandos Redis" className="bg-bg-surface">
            {comandosExibidos.length === 0 ? (
              <p className="p-5 text-xs text-ink-muted text-center">
                Execute qualquer operação na loja para visualizar os comandos Redis ao vivo.
              </p>
            ) : (
              <div className="max-h-[520px] overflow-y-auto divide-y divide-border-subtle">
                {comandosExibidos.map((item) => {
                  const ehDaUltimaAcao = idsRecentes.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`p-3 text-xs space-y-1.5 ${
                        ehDaUltimaAcao ? 'bg-brand-amber-soft/45' : 'bg-bg-surface'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={VARIANTE_OPERACAO[item.operacao]}>{item.operacao}</Badge>
                          {ehDaUltimaAcao && <Badge variant="amber">AGORA</Badge>}
                        </div>
                        <span className="text-[11px] text-ink-muted tabular-nums">
                          {formatarHora(item.executadoEm)}
                        </span>
                      </div>
                      <pre className="font-mono text-[11px] text-brand-navy whitespace-pre-wrap break-all">
                        {item.comando}
                      </pre>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div
            role="tabpanel"
            aria-label="Keyspace Redis"
            className="p-3.5 space-y-3 bg-bg-surface"
          >
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['todos', 'Todas'],
                  ['carrinho:', 'Carrinho'],
                  ['produto:', 'Produtos'],
                  ['catalogo:', 'Índices'],
                ] as Array<[FiltroPrefixo, string]>
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFiltro(valor)}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold cursor-pointer border transition-colors ${
                    filtro === valor
                      ? 'bg-brand-navy text-white border-brand-navy'
                      : 'bg-bg-surface text-ink-secondary border-border-strong hover:bg-bg-muted'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            {chavesFiltradas.length === 0 ? (
              <p className="py-4 text-xs text-ink-muted text-center">
                Nenhuma chave encontrada para este filtro.
              </p>
            ) : (
              <div className="max-h-[520px] overflow-y-auto space-y-2 pr-0.5">
                {chavesFiltradas.map((chave) => (
                  <div
                    key={chave.chave}
                    className="rounded-md border border-border-subtle p-2.5 space-y-1.5 bg-bg-surface"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <code className="text-xs font-bold text-brand-navy break-all">
                        {chave.chave}
                      </code>
                      <div className="flex items-center gap-1">
                        <Badge variant="navy">{chave.tipo.toUpperCase()}</Badge>
                        <Badge variant={chave.ttlSegundos > 0 ? 'amber' : 'neutral'}>
                          {chave.ttlSegundos > 0
                            ? `TTL: ${formatarTtl(chave.ttlSegundos)}`
                            : 'Sem TTL'}
                        </Badge>
                      </div>
                    </div>
                    {renderValorChave(chave)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </aside>
  );
};
