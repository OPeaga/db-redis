export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatarTtl(segundos: number): string {
  if (segundos === -1) return 'Persistente (sem TTL)';
  if (segundos <= -2) return 'Expirado / Inexistente';
  if (segundos < 60) return `${segundos}s`;

  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')} (${segundos}s)`;
}

export function formatarHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}
