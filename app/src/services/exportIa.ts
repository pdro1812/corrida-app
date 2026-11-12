import { obterBanco } from '../db/banco';
import { montarExportIa, TreinoParaExport } from '../dominio/exportIa';
import { provaAlvoDoCiclo } from '../types/modelo';
import { buscarCicloAtivo } from './ciclos';
import { listarBemEstar } from './bemEstar';
import { agruparPor, LinhaIntervaloRealizado, somarDias } from './linhas';

// v2: junta treinos, previsto, métricas do FIT, clima e feedback do
// período e gera o texto para colar no Claude.

interface LinhaExport {
  id: string;
  data: string;
  distancia_km: number | null;
  duracao_segundos: number | null;
  pace_medio: string | null;
  fc_media: number | null;
  fc_max: number | null;
  elevacao_m: number | null;
  rpe: number | null;
  sensacoes: string;
  feedback_texto: string | null;
  p_tipo: string | null;
  p_descricao: string | null;
  p_pace_min: string | null;
  p_pace_max: string | null;
  cadencia_media_ppm: number | null;
  potencia_media_w: number | null;
  efeito_treino_aerobico: number | null;
  efeito_treino_anaerobico: number | null;
  desacoplamento_pct: number | null;
  clima_temperatura_c: number | null;
  clima_sensacao_termica_c: number | null;
  clima_umidade_pct: number | null;
  clima_vento_kmh: number | null;
  clima_codigo_tempo: number | null;
}

function sensacoes(json: string): string[] {
  try {
    const valor: unknown = JSON.parse(json);
    return Array.isArray(valor) ? valor.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

// semanas = null exporta tudo.
export async function gerarExportIa(semanas: number | null, agora = new Date()): Promise<string> {
  const banco = await obterBanco();
  const hoje = agora.toISOString().slice(0, 10);
  const desde = semanas === null ? '0000-01-01' : somarDias(hoje, -7 * semanas);
  const linhas = await banco.todos<LinhaExport>(
    `SELECT r.id, r.data, r.distancia_km, r.duracao_segundos, r.pace_medio, r.fc_media, r.fc_max, r.elevacao_m,
            r.rpe, r.sensacoes, r.feedback_texto,
            p.tipo AS p_tipo, p.descricao AS p_descricao, p.pace_alvo_min AS p_pace_min, p.pace_alvo_max AS p_pace_max,
            m.cadencia_media_ppm, m.potencia_media_w, m.efeito_treino_aerobico, m.efeito_treino_anaerobico,
            m.desacoplamento_pct, m.clima_temperatura_c, m.clima_sensacao_termica_c, m.clima_umidade_pct,
            m.clima_vento_kmh, m.clima_codigo_tempo
       FROM treino_realizado r
       LEFT JOIN treino_previsto p ON p.id = r.treino_previsto_id
       LEFT JOIN treino_metricas m ON m.treino_realizado_id = r.id
      WHERE r.data >= ?
      ORDER BY r.data`,
    [desde],
  );
  const intervalos = agruparPor(
    await banco.todos<LinhaIntervaloRealizado>(
      `SELECT i.* FROM treino_realizado_intervalo i JOIN treino_realizado r ON r.id = i.treino_realizado_id
        WHERE r.data >= ? ORDER BY i.ordem`,
      [desde],
    ),
    (i) => i.treino_realizado_id,
  );

  const treinos: TreinoParaExport[] = linhas.map((l) => ({
    data: l.data,
    tipoPrevisto: l.p_tipo,
    descricaoPrevista: l.p_descricao,
    paceAlvoMin: l.p_pace_min,
    paceAlvoMax: l.p_pace_max,
    distanciaKm: l.distancia_km,
    duracaoSegundos: l.duracao_segundos,
    paceMedio: l.pace_medio,
    fcMedia: l.fc_media,
    fcMax: l.fc_max,
    elevacaoM: l.elevacao_m,
    rpe: l.rpe,
    sensacoes: sensacoes(l.sensacoes),
    feedbackTexto: l.feedback_texto,
    cadenciaPpm: l.cadencia_media_ppm,
    potenciaW: l.potencia_media_w,
    efeitoAerobico: l.efeito_treino_aerobico,
    efeitoAnaerobico: l.efeito_treino_anaerobico,
    desacoplamentoPct: l.desacoplamento_pct,
    temperaturaC: l.clima_temperatura_c,
    sensacaoTermicaC: l.clima_sensacao_termica_c,
    umidadePct: l.clima_umidade_pct,
    ventoKmh: l.clima_vento_kmh,
    codigoTempo: l.clima_codigo_tempo,
    intervalos: (intervalos.get(l.id) ?? []).map((i) => ({
      tipo: i.tipo,
      distanciaKm: i.distancia_km,
      tempoSegundos: i.tempo_segundos,
      paceMedio: i.pace_medio,
      fcMedia: i.fc_media,
    })),
  }));

  const ciclo = await buscarCicloAtivo();
  const prova = ciclo ? provaAlvoDoCiclo(ciclo) : null;
  return montarExportIa(treinos, {
    geradoEm: agora.toISOString(),
    bemEstar: await listarBemEstar(desde),
    periodo: semanas === null ? 'todo o histórico' : `últimas ${semanas} semanas`,
    ciclo: ciclo ? { nome: ciclo.nome, dataInicio: ciclo.dataInicio, dataFim: ciclo.dataFim } : null,
    provaAlvo: prova
      ? { nome: prova.nome, data: prova.data, distanciaKm: prova.distanciaKm, metaTempoSegundos: prova.metaTempoSegundos }
      : null,
  });
}
