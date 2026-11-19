export function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatarTtl(segundos: number): string {
  if (segundos === -1) return 'Sem expiração';
  if (segundos <= -2) return 'Expirado';
  if (segundos < 60) return `${segundos}s`;

  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return `${String(minutos).padStart(2, '0')}:${String(resto).padStart(2, '0')}`;
}
