import { obterBanco } from '../db/banco';
import { TreinoParaExport } from '../dominio/exportIa';
import { AnaliseTreino } from '../dominio/blocosFit';
import {
  EntradaExport,
  montarExportGrafo,
  paceSegundos,
  PrevistoEntrada,
  RealizadoEntrada,
  textoParaIa,
} from '../dominio/exportGrafo';
import { gravarConfiguracao, lerConfiguracao } from './configuracoes';
import { provaAlvoDoCiclo } from '../types/modelo';
import { buscarCicloAtivo } from './ciclos';
import { listarBemEstar } from './bemEstar';
import { agruparPor, LinhaIntervaloPrevisto, LinhaIntervaloRealizado, somarDias } from './linhas';

// Junta treinos, previsto, métricas do FIT, análise por blocos, clima,
// recuperação e feedback do período e gera o texto para colar no Claude.

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

// v2: também usada pela tela Lab.
export async function carregarTreinosParaAnalise(desde: string): Promise<TreinoParaExport[]> {
  const banco = await obterBanco();
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
  return treinos;
}

// ---------- export em grafo para a IA ----------

const CONFIG_FC_LIMIAR = 'fc_limiar';
const CONFIG_PACE_LIMIAR = 'pace_limiar';

export interface Limiares {
  fcLimiar: number | null;
  paceLimiar: string | null; // "4:50"
}

export async function lerLimiares(): Promise<Limiares> {
  const fc = Number(await lerConfiguracao(CONFIG_FC_LIMIAR));
  const pace = await lerConfiguracao(CONFIG_PACE_LIMIAR);
  return { fcLimiar: Number.isFinite(fc) && fc > 0 ? fc : null, paceLimiar: paceSegundos(pace) ? pace : null };
}

export async function salvarLimiares(fcTexto: string, paceTexto: string): Promise<void> {
  const fc = Number(fcTexto.trim());
  if (fcTexto.trim() && !(Number.isInteger(fc) && fc >= 100 && fc <= 220)) {
    throw new Error('FC de limiar deve ser um número entre 100 e 220');
  }
  const pace = paceTexto.trim();
  const ps = paceSegundos(pace);
  if (pace && (ps === null || ps < 150 || ps > 600)) throw new Error('Pace de limiar no formato m:ss, ex: 4:50');
  await gravarConfiguracao(CONFIG_FC_LIMIAR, fcTexto.trim() ? String(fc) : '');
  await gravarConfiguracao(CONFIG_PACE_LIMIAR, pace);
}

function lerJson<T>(texto: string | null): T | null {
  if (!texto) return null;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return null;
  }
}

interface LinhaPrevistoExport {
  id: string;
  data: string;
  tipo: string | null;
  descricao: string;
  distancia_alvo_km: number | null;
  duracao_alvo_segundos: number | null;
  pace_alvo_min: string | null;
  pace_alvo_max: string | null;
  status: string;
  motivo_nao_realizado: string | null;
  numero_semana: number | null;
  fase: string | null;
  rotina_extra: string | null;
}

interface LinhaRealizadoExport {
  id: string;
  treino_previsto_id: string | null;
  data: string;
  distancia_km: number | null;
  duracao_segundos: number | null;
  pace_medio: string | null;
  fc_media: number | null;
  elevacao_m: number | null;
  rpe: number | null;
  sensacoes: string;
  feedback_texto: string | null;
  tem_metricas: number | null;
  efeito_treino_aerobico: number | null;
  efeito_treino_anaerobico: number | null;
  carga_treino: number | null;
  cadencia_media_ppm: number | null;
  potencia_media_w: number | null;
  tempo_contato_solo_ms: number | null;
  oscilacao_vertical_mm: number | null;
  comprimento_passada_m: number | null;
  desacoplamento_pct: number | null;
  clima_temperatura_c: number | null;
  clima_sensacao_termica_c: number | null;
  clima_umidade_pct: number | null;
  clima_vento_kmh: number | null;
  clima_precipitacao_mm: number | null;
  clima_codigo_tempo: number | null;
  analise_json: string | null;
}

export async function montarEntradaExport(semanas: number | null, agora = new Date()): Promise<EntradaExport> {
  const banco = await obterBanco();
  const fim = agora.toISOString().slice(0, 10);
  let inicio = semanas === null ? null : somarDias(fim, -7 * semanas + 1);
  if (inicio === null) {
    const primeiro = await banco.primeiro<{ data: string | null }>(
      'SELECT MIN(data) AS data FROM (SELECT data FROM treino_realizado UNION ALL SELECT data FROM treino_previsto)',
    );
    inicio = primeiro?.data ?? fim;
  }

  const previstosLinhas = await banco.todos<LinhaPrevistoExport>(
    `SELECT p.id, p.data, p.tipo, p.descricao, p.distancia_alvo_km, p.duracao_alvo_segundos, p.pace_alvo_min,
            p.pace_alvo_max, p.status, p.motivo_nao_realizado, s.numero_semana, s.fase, s.rotina_extra
       FROM treino_previsto p LEFT JOIN semana s ON s.id = p.semana_id
      WHERE p.data BETWEEN ? AND ? ORDER BY p.data`,
    [inicio, fim],
  );
  const realizadosLinhas = await banco.todos<LinhaRealizadoExport>(
    `SELECT r.id, r.treino_previsto_id, r.data, r.distancia_km, r.duracao_segundos, r.pace_medio, r.fc_media,
            r.elevacao_m, r.rpe, r.sensacoes, r.feedback_texto,
            m.treino_realizado_id AS tem_metricas, m.efeito_treino_aerobico, m.efeito_treino_anaerobico,
            m.carga_treino, m.cadencia_media_ppm, m.potencia_media_w, m.tempo_contato_solo_ms,
            m.oscilacao_vertical_mm, m.comprimento_passada_m, m.desacoplamento_pct, m.clima_temperatura_c,
            m.clima_sensacao_termica_c, m.clima_umidade_pct, m.clima_vento_kmh, m.clima_precipitacao_mm,
            m.clima_codigo_tempo, a.json AS analise_json
       FROM treino_realizado r
       LEFT JOIN treino_metricas m ON m.treino_realizado_id = r.id
       LEFT JOIN treino_analise a ON a.treino_realizado_id = r.id
      WHERE r.data BETWEEN ? AND ? ORDER BY r.data`,
    [inicio, fim],
  );
  // Previstos de outro dia ligados a um realizado do período (treino trocado de dia).
  const idsPrevistos = new Set(previstosLinhas.map((p) => p.id));
  for (const r of realizadosLinhas) {
    if (!r.treino_previsto_id || idsPrevistos.has(r.treino_previsto_id)) continue;
    const extra = await banco.primeiro<LinhaPrevistoExport>(
      `SELECT p.id, p.data, p.tipo, p.descricao, p.distancia_alvo_km, p.duracao_alvo_segundos, p.pace_alvo_min,
              p.pace_alvo_max, p.status, p.motivo_nao_realizado, s.numero_semana, s.fase, s.rotina_extra
         FROM treino_previsto p LEFT JOIN semana s ON s.id = p.semana_id WHERE p.id = ?`,
      [r.treino_previsto_id],
    );
    if (extra) {
      previstosLinhas.push(extra);
      idsPrevistos.add(extra.id);
    }
  }
  const intervalos = agruparPor(
    previstosLinhas.length
      ? await banco.todos<LinhaIntervaloPrevisto>(
          `SELECT * FROM treino_previsto_intervalo WHERE treino_previsto_id IN (${previstosLinhas.map(() => '?').join(', ')})
            ORDER BY ordem`,
          previstosLinhas.map((p) => p.id),
        )
      : [],
    (i) => i.treino_previsto_id,
  );

  const previstos: PrevistoEntrada[] = previstosLinhas.map((p) => ({
    id: p.id,
    data: p.data,
    tipo: p.tipo,
    descricao: p.descricao,
    distanciaAlvoKm: p.distancia_alvo_km,
    duracaoAlvoSegundos: p.duracao_alvo_segundos,
    paceAlvoMin: p.pace_alvo_min,
    paceAlvoMax: p.pace_alvo_max,
    status: p.status,
    motivoNaoRealizado: p.motivo_nao_realizado,
    semana: p.numero_semana !== null ? { numero: p.numero_semana, fase: p.fase, rotinaExtra: p.rotina_extra } : null,
    intervalos: (intervalos.get(p.id) ?? []).map((i) => ({
      ordem: i.ordem,
      tipo: i.tipo,
      distanciaAlvoKm: i.distancia_alvo_km,
      duracaoAlvoSegundos: i.duracao_alvo_segundos,
      paceAlvoMin: i.pace_alvo_min,
      paceAlvoMax: i.pace_alvo_max,
    })),
  }));

  const realizados: RealizadoEntrada[] = realizadosLinhas.map((r) => ({
    id: r.id,
    previstoId: r.treino_previsto_id,
    data: r.data,
    distanciaKm: r.distancia_km,
    duracaoSegundos: r.duracao_segundos,
    paceMedio: r.pace_medio,
    fcMedia: r.fc_media,
    elevacaoM: r.elevacao_m,
    rpe: r.rpe,
    sensacoes: sensacoes(r.sensacoes),
    feedbackTexto: r.feedback_texto,
    sessao:
      r.tem_metricas === null
        ? null
        : {
            efeitoAerobico: r.efeito_treino_aerobico,
            efeitoAnaerobico: r.efeito_treino_anaerobico,
            carga: r.carga_treino,
            cadencia: r.cadencia_media_ppm,
            potencia: r.potencia_media_w,
            contatoMs: r.tempo_contato_solo_ms,
            oscilacaoMm: r.oscilacao_vertical_mm,
            passadaM: r.comprimento_passada_m,
            desacoplamentoPct: r.desacoplamento_pct,
            temperaturaC: r.clima_temperatura_c,
            sensacaoTermicaC: r.clima_sensacao_termica_c,
            umidadePct: r.clima_umidade_pct,
            ventoKmh: r.clima_vento_kmh,
            precipitacaoMm: r.clima_precipitacao_mm,
            codigoTempo: r.clima_codigo_tempo,
          },
    analise: lerJson<AnaliseTreino>(r.analise_json),
  }));

  const limiares = await lerLimiares();
  const ciclo = await buscarCicloAtivo();
  const prova = ciclo ? provaAlvoDoCiclo(ciclo) : null;
  return {
    geradoEm: agora.toISOString(),
    inicio,
    fim,
    atleta: {
      fcLimiar: limiares.fcLimiar,
      paceLimiarS: paceSegundos(limiares.paceLimiar),
      provaAlvo: prova
        ? { nome: prova.nome, data: prova.data, distanciaKm: prova.distanciaKm, metaTempoSegundos: prova.metaTempoSegundos }
        : null,
    },
    // 28 dias antes do início servem de linha de base para os desvios (dz).
    bemEstar: await listarBemEstar(somarDias(inicio, -28)),
    previstos,
    realizados,
  };
}

// semanas = null exporta tudo. Devolve o prompt + o JSON, pronto para colar.
export async function gerarExportIa(semanas: number | null, agora = new Date()): Promise<string> {
  return textoParaIa(montarExportGrafo(await montarEntradaExport(semanas, agora)));
}
