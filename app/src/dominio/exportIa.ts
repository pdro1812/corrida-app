import { descreverTempo } from './clima';
import { calcularCustoEsforco, indiceCustoRelativo } from './custoEsforco';

// v2: export compacto de treinos e métricas para colar numa conversa com o
// Claude (o "treinador"), sem API paga. Markdown com tabelas em CSV de ';'
// — denso em tokens e fácil de um modelo ler. Lógica pura, sem I/O.
// Nunca inclui coordenadas nem a chave da Garmin.

export interface IntervaloParaExport {
  tipo: string;
  distanciaKm: number | null;
  tempoSegundos: number | null;
  paceMedio: string | null;
  fcMedia: number | null;
}

export interface TreinoParaExport {
  data: string;
  tipoPrevisto: string | null;
  descricaoPrevista: string | null;
  paceAlvoMin: string | null;
  paceAlvoMax: string | null;
  distanciaKm: number | null;
  duracaoSegundos: number | null;
  paceMedio: string | null;
  fcMedia: number | null;
  fcMax: number | null;
  elevacaoM: number | null;
  rpe: number | null;
  sensacoes: string[];
  feedbackTexto: string | null;
  cadenciaPpm: number | null;
  potenciaW: number | null;
  efeitoAerobico: number | null;
  efeitoAnaerobico: number | null;
  desacoplamentoPct: number | null;
  temperaturaC: number | null;
  sensacaoTermicaC: number | null;
  umidadePct: number | null;
  ventoKmh: number | null;
  codigoTempo: number | null;
  intervalos: IntervaloParaExport[];
}

export interface ContextoExport {
  geradoEm: string; // ISO
  periodo: string; // ex: "últimas 8 semanas"
  ciclo?: { nome: string; dataInicio: string; dataFim: string } | null;
  provaAlvo?: { nome: string; data: string; distanciaKm: number | null; metaTempoSegundos: number | null } | null;
}

const vazio = (v: unknown): string => (v === null || v === undefined || v === '' ? '' : String(v));

const limpar = (texto: string | null): string => (texto ?? '').replace(/[;\s]+/g, ' ').trim();

export function formatarTempo(segundos: number | null): string {
  if (segundos === null || segundos === undefined) return '';
  const s = Math.round(segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const resto = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${resto}` : `${m}:${resto}`;
}

// Segunda-feira da semana ISO da data.
function inicioDaSemana(dataIso: string): string {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const ABREVIACAO_INTERVALO: Record<string, string> = { warmup: 'aq', run: 'T', recovery: 'rec', cooldown: 'desaq' };

function linhaIntervalos(intervalos: IntervaloParaExport[]): string {
  return intervalos
    .map((i) =>
      [
        ABREVIACAO_INTERVALO[i.tipo] ?? i.tipo,
        i.distanciaKm !== null ? `${i.distanciaKm.toFixed(2)}km` : '',
        formatarTempo(i.tempoSegundos),
        i.paceMedio ? `${i.paceMedio}/km` : '',
        i.fcMedia ? `${i.fcMedia}bpm` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
    .join(' | ');
}

export function montarExportIa(treinosEntrada: TreinoParaExport[], contexto: ContextoExport): string {
  const treinos = [...treinosEntrada].sort((a, b) => a.data.localeCompare(b.data));

  // Custo ajustado de cada treino e índice contra o histórico ANTERIOR do
  // mesmo tipo (100 = típico).
  const historicoPorTipo = new Map<string, (number | null)[]>();
  const linhas = treinos.map((t) => {
    const custo = calcularCustoEsforco({
      distanciaKm: t.distanciaKm,
      duracaoSegundos: t.duracaoSegundos,
      fcMedia: t.fcMedia,
      elevacaoM: t.elevacaoM,
      rpe: t.rpe,
      desacoplamentoPct: t.desacoplamentoPct,
      temperaturaC: t.temperaturaC,
    });
    const tipo = t.tipoPrevisto ?? 'sem_plano';
    const historico = historicoPorTipo.get(tipo) ?? [];
    const indice = indiceCustoRelativo(custo.batimentosPorKmAjustado, historico);
    historicoPorTipo.set(tipo, [...historico, custo.batimentosPorKmAjustado]);
    return { t, custo, indice, tipo };
  });

  const saida: string[] = [];
  saida.push('# Meus treinos de corrida: export para análise');
  saida.push('');
  saida.push(
    `Gerado em ${contexto.geradoEm.slice(0, 16).replace('T', ' ')} · ${contexto.periodo} · ${treinos.length} treino(s). ` +
      'Dados do relógio Garmin + clima (Open-Meteo) + percepção de esforço que eu registrei.',
  );

  if (contexto.ciclo || contexto.provaAlvo) {
    saida.push('', '## Contexto');
    if (contexto.ciclo) {
      saida.push(`- Ciclo: ${contexto.ciclo.nome} (${contexto.ciclo.dataInicio} a ${contexto.ciclo.dataFim})`);
    }
    if (contexto.provaAlvo) {
      const p = contexto.provaAlvo;
      const meta = p.metaTempoSegundos ? ` · meta ${formatarTempo(p.metaTempoSegundos)}` : '';
      saida.push(`- Prova alvo: ${p.nome}, ${p.data}${p.distanciaKm ? ` · ${p.distanciaKm} km` : ''}${meta}`);
    }
  }

  // Resumo semanal
  const semanas = new Map<string, { km: number; seg: number; n: number; rpes: number[]; carga: number }>();
  for (const { t, custo } of linhas) {
    const chave = inicioDaSemana(t.data);
    const s = semanas.get(chave) ?? { km: 0, seg: 0, n: 0, rpes: [], carga: 0 };
    s.km += t.distanciaKm ?? 0;
    s.seg += t.duracaoSegundos ?? 0;
    s.n += 1;
    if (t.rpe !== null) s.rpes.push(t.rpe);
    s.carga += custo.cargaSessao ?? 0;
    semanas.set(chave, s);
  }
  saida.push('', '## Resumo semanal', '```csv', 'semana;km;treinos;tempo;rpe_medio;carga_srpe');
  for (const [semana, s] of semanas) {
    const rpeMedio = s.rpes.length ? (s.rpes.reduce((a, b) => a + b, 0) / s.rpes.length).toFixed(1) : '';
    saida.push([semana, s.km.toFixed(1), s.n, formatarTempo(s.seg), rpeMedio, Math.round(s.carga) || ''].join(';'));
  }
  saida.push('```');

  saida.push('', '## Treinos', '```csv');
  saida.push(
    'data;tipo;plano;pace_alvo;km;tempo;pace;fc;fc_max;subida_m;cad_ppm;pot_w;te_aer;te_anaer;desac_pct;' +
      'temp_c;sens_termica_c;umid_pct;vento_kmh;condicao;rpe;bpm_km_aj;custo_idx;sensacoes;nota',
  );
  for (const { t, custo, indice, tipo } of linhas) {
    const paceAlvo = t.paceAlvoMin ? `${t.paceAlvoMin}${t.paceAlvoMax ? `-${t.paceAlvoMax}` : ''}` : '';
    saida.push(
      [
        t.data,
        tipo,
        limpar(t.descricaoPrevista),
        paceAlvo,
        t.distanciaKm !== null ? t.distanciaKm.toFixed(2) : '',
        formatarTempo(t.duracaoSegundos),
        vazio(t.paceMedio),
        vazio(t.fcMedia),
        vazio(t.fcMax),
        t.elevacaoM !== null ? Math.round(t.elevacaoM) : '',
        vazio(t.cadenciaPpm),
        vazio(t.potenciaW),
        vazio(t.efeitoAerobico),
        vazio(t.efeitoAnaerobico),
        vazio(t.desacoplamentoPct),
        vazio(t.temperaturaC),
        vazio(t.sensacaoTermicaC),
        vazio(t.umidadePct),
        vazio(t.ventoKmh),
        vazio(descreverTempo(t.codigoTempo)),
        vazio(t.rpe),
        vazio(custo.batimentosPorKmAjustado),
        vazio(indice),
        t.sensacoes.join(','),
        limpar(t.feedbackTexto),
      ].join(';'),
    );
  }
  saida.push('```');

  const comIntervalos = linhas.filter(({ t }) => t.intervalos.length > 1);
  if (comIntervalos.length > 0) {
    saida.push('', '## Intervalos (aq = aquecimento, T = tiro, rec = recuperação, desaq = desaquecimento)');
    for (const { t } of comIntervalos) saida.push(`- ${t.data}: ${linhaIntervalos(t.intervalos)}`);
  }

  saida.push(
    '',
    '## Como ler',
    '- fc = FC média (bpm); cad_ppm = cadência em passos/min; pot_w = potência média; te_aer/te_anaer = Training Effect Garmin (0-5).',
    '- desac_pct = deriva cardíaca: quanto a eficiência (velocidade/FC) caiu da 1ª para a 2ª metade, sem os 10 min iniciais. Abaixo de 5% = estável.',
    '- rpe = minha percepção de esforço (0-10). carga_srpe = RPE x minutos.',
    '- bpm_km_aj = batimentos por km ajustados por subida (~1% a cada 10 m/km) e calor (~1% por °C acima de 15 °C).',
    '- custo_idx = bpm_km_aj comparado com a mediana dos treinos anteriores do mesmo tipo (100 = típico; 110 = custou 10% mais). Vazio se houver menos de 3 treinos para comparar.',
    '- Clima na hora do meio do treino; temperatura do ar, não a do relógio.',
    '',
    '## O que eu quero de você',
    'Você é meu treinador de corrida. Analise a evolução, a relação entre clima, esforço percebido e custo cardíaco, ' +
      'sinais de fadiga ou de overreaching, e a aderência ao plano. Diga o que está indo bem, o que preocupa e o que ajustar nas próximas semanas.',
  );

  return saida.join('\n');
}
