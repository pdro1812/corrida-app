import { Banco, obterBanco } from '../db/banco';
import { COLUNAS_TREINO_METRICAS } from '../db/esquema';
import { arredondarCoordenada, ClimaTreino, horaDeReferencia, lerClima, montarUrlClima } from '../dominio/clima';
import { MetricasFit } from '../dominio/metricasFit';
import { agoraIso } from './linhas';

// v2: grava e completa treino_metricas (FIT completo + clima). As funções
// de rede chegam por parâmetro para o sync controlar timeout/limites e os
// testes não precisarem de internet.

export type LinhaTreinoMetricas = Record<(typeof COLUNAS_TREINO_METRICAS)[number], string | number | null>;

export async function gravarMetricasFit(banco: Banco, treinoRealizadoId: string, m: MetricasFit): Promise<void> {
  const valores: Partial<LinhaTreinoMetricas> = {
    treino_realizado_id: treinoRealizadoId,
    hora_inicio: m.horaInicio,
    latitude: m.latitudeInicio === null ? null : arredondarCoordenada(m.latitudeInicio),
    longitude: m.longitudeInicio === null ? null : arredondarCoordenada(m.longitudeInicio),
    cadencia_media_ppm: m.cadenciaMediaPpm,
    cadencia_max_ppm: m.cadenciaMaxPpm,
    potencia_media_w: m.potenciaMediaW,
    potencia_normalizada_w: m.potenciaNormalizadaW,
    oscilacao_vertical_mm: m.oscilacaoVerticalMm,
    razao_vertical_pct: m.razaoVerticalPct,
    tempo_contato_solo_ms: m.tempoContatoSoloMs,
    comprimento_passada_m: m.comprimentoPassadaM,
    calorias: m.calorias,
    temperatura_relogio_c: m.temperaturaMediaC,
    descida_m: m.descidaM,
    efeito_treino_aerobico: m.efeitoTreinoAerobico,
    efeito_treino_anaerobico: m.efeitoTreinoAnaerobico,
    carga_treino: m.cargaTreino,
    desacoplamento_pct: m.desacoplamentoPct,
    fit_lido_em: agoraIso(),
  };
  // Nomes de coluna vêm da lista fixa acima, nunca de entrada externa.
  const colunas = Object.keys(valores) as (keyof LinhaTreinoMetricas)[];
  // Upsert: preserva o clima se a linha já existir.
  await banco.executar(
    `INSERT INTO treino_metricas (${colunas.join(', ')}) VALUES (${colunas.map(() => '?').join(', ')})
     ON CONFLICT(treino_realizado_id) DO UPDATE SET ${colunas
       .filter((c) => c !== 'treino_realizado_id')
       .map((c) => `${c} = excluded.${c}`)
       .join(', ')}`,
    colunas.map((c) => valores[c] ?? null),
  );
}

export async function gravarClima(banco: Banco, treinoRealizadoId: string, clima: ClimaTreino | null): Promise<void> {
  // clima_buscado_em é gravado mesmo sem resultado, para não repetir a
  // busca a cada sync.
  await banco.executar(
    `UPDATE treino_metricas SET clima_temperatura_c = ?, clima_sensacao_termica_c = ?, clima_umidade_pct = ?,
       clima_ponto_orvalho_c = ?, clima_vento_kmh = ?, clima_precipitacao_mm = ?, clima_codigo_tempo = ?,
       clima_buscado_em = ?
     WHERE treino_realizado_id = ?`,
    [
      clima?.temperaturaC ?? null,
      clima?.sensacaoTermicaC ?? null,
      clima?.umidadePct ?? null,
      clima?.pontoOrvalhoC ?? null,
      clima?.ventoKmh ?? null,
      clima?.precipitacaoMm ?? null,
      clima?.codigoTempo ?? null,
      agoraIso(),
      treinoRealizadoId,
    ],
  );
}

// Treinos da Garmin importados antes da v2 (ou cujo FIT falhou) ainda sem
// métricas. Limite por sync para não martelar a API.
export async function treinosSemMetricas(banco: Banco, limite: number) {
  return banco.todos<{ id: string; garmin_activity_id: string }>(
    `SELECT r.id, r.garmin_activity_id FROM treino_realizado r
       LEFT JOIN treino_metricas m ON m.treino_realizado_id = r.id
      WHERE r.garmin_activity_id IS NOT NULL AND m.treino_realizado_id IS NULL
      ORDER BY r.data DESC LIMIT ?`,
    [limite],
  );
}

// Busca o clima dos treinos com coordenada e hora ainda não consultados.
export async function completarClimaPendente(
  banco: Banco,
  buscarJson: (url: string) => Promise<unknown>,
  limite = 15,
): Promise<number> {
  const pendentes = await banco.todos<{
    treino_realizado_id: string;
    hora_inicio: string;
    latitude: number;
    longitude: number;
    duracao_segundos: number | null;
  }>(
    `SELECT m.treino_realizado_id, m.hora_inicio, m.latitude, m.longitude, r.duracao_segundos
       FROM treino_metricas m JOIN treino_realizado r ON r.id = m.treino_realizado_id
      WHERE m.clima_buscado_em IS NULL AND m.hora_inicio IS NOT NULL
        AND m.latitude IS NOT NULL AND m.longitude IS NOT NULL
      ORDER BY m.hora_inicio DESC LIMIT ?`,
    [limite],
  );
  let completados = 0;
  for (const p of pendentes) {
    const hora = horaDeReferencia(p.hora_inicio, p.duracao_segundos);
    try {
      const resposta = await buscarJson(montarUrlClima(p.latitude, p.longitude, hora));
      await gravarClima(banco, p.treino_realizado_id, lerClima(resposta, hora));
      completados++;
    } catch {
      // sem internet ou Open-Meteo fora: tenta de novo no próximo sync
    }
  }
  return completados;
}

export async function buscarMetricas(treinoRealizadoId: string): Promise<LinhaTreinoMetricas | null> {
  const banco = await obterBanco();
  return banco.primeiro<LinhaTreinoMetricas>('SELECT * FROM treino_metricas WHERE treino_realizado_id = ?', [
    treinoRealizadoId,
  ]);
}
