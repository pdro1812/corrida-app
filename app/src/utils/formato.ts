export function formatarDuracao(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) {
    return '-';
  }
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const segs = Math.floor(segundos % 60);

  if (horas > 0) {
    return `${horas}:${minutos.toString().padStart(2, '0')}:${segs.toString().padStart(2, '0')}`;
  }
  return `${minutos}:${segs.toString().padStart(2, '0')}`;
}

export function formatarKm(km: number | null | undefined): string {
  if (km === null || km === undefined) {
    return '-';
  }
  return `${km.toFixed(2)} km`;
}

export function formatarData(dataISO: string): string {
  const data = new Date(dataISO);
  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
}
