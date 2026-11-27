// Sync automático em horários fixos (ex.: 08:00 e 20:00, hora do aparelho).
// O Android não garante horário exato em segundo plano: a tarefa roda de
// tempos em tempos e sincroniza se já passou um horário sem sync depois dele.

export const HORARIOS_PADRAO = ['08:00', '20:00'];

export function lerHorarios(texto: string | null | undefined): string[] {
  const horarios = (texto ?? '')
    .split(/[,;\s]+/)
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => {
      const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(h);
      if (!m) return null;
      const hora = Number(m[1]);
      const minuto = Number(m[2] ?? '0');
      if (hora > 23 || minuto > 59) return null;
      return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
    });
  if (horarios.some((h) => h === null)) throw new Error('Use horários no formato HH:MM, separados por vírgula');
  return [...new Set(horarios as string[])].sort();
}

// O horário agendado mais recente que já passou (hoje ou ontem).
export function ultimoHorarioAgendado(agora: Date, horarios: string[]): Date | null {
  let melhor: Date | null = null;
  for (const diasAtras of [0, 1]) {
    for (const h of horarios) {
      const [hora, minuto] = h.split(':').map(Number);
      const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - diasAtras, hora, minuto, 0, 0);
      if (d <= agora && (!melhor || d > melhor)) melhor = d;
    }
  }
  return melhor;
}

export function precisaSincronizar(agora: Date, ultimaSyncIso: string | null, horarios: string[]): boolean {
  const alvo = ultimoHorarioAgendado(agora, horarios);
  if (!alvo) return false;
  if (!ultimaSyncIso) return true;
  const ultima = Date.parse(ultimaSyncIso);
  return Number.isNaN(ultima) || ultima < alvo.getTime();
}
