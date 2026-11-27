import { obterBanco } from '../db/banco';
import { AtividadeGarmin } from '../dominio/garmin';
import { agoraIso, novoId, soData } from './linhas';

// Recordes pessoais (melhor tempo por distância). Entram no perfil do
// banco de análise para a IA saber de onde o atleta parte.

export interface RecordePessoal {
  id: string;
  distanciaKm: number;
  tempoSegundos: number;
  data: string | null;
  descricao: string | null;
}

interface LinhaRecorde {
  id: string;
  distancia_km: number;
  tempo_segundos: number;
  data: string | null;
  descricao: string | null;
}

// "1:45:30", "45:10" ou "19:59" -> segundos.
export function lerTempo(texto: string): number | null {
  const partes = texto.trim().split(':');
  if (partes.length < 2 || partes.length > 3 || partes.some((p) => !/^\d+$/.test(p))) return null;
  const n = partes.map(Number);
  if (n.slice(1).some((v) => v >= 60)) return null;
  return n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n[0] * 60 + n[1];
}

export async function listarRecordes(): Promise<RecordePessoal[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<LinhaRecorde>(
    'SELECT id, distancia_km, tempo_segundos, data, descricao FROM recorde_pessoal ORDER BY distancia_km, tempo_segundos',
  );
  return linhas.map((l) => ({
    id: l.id,
    distanciaKm: l.distancia_km,
    tempoSegundos: l.tempo_segundos,
    data: l.data,
    descricao: l.descricao,
  }));
}

export async function criarRecorde(dados: {
  distanciaKm: string;
  tempo: string;
  data?: string;
  descricao?: string;
  garminActivityId?: string | null;
}) {
  const distancia = Number(dados.distanciaKm.replace(',', '.'));
  if (!Number.isFinite(distancia) || distancia <= 0 || distancia > 300) throw new Error('Informe a distância em km, ex: 21.1');
  const tempo = lerTempo(dados.tempo);
  if (!tempo) throw new Error('Use o formato H:MM:SS ou M:SS para o tempo');
  const data = dados.data?.trim() ? soData(dados.data) : null;
  const banco = await obterBanco();
  await banco.executar(
    `INSERT INTO recorde_pessoal (id, distancia_km, tempo_segundos, data, descricao, criado_em, garmin_activity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [novoId(), distancia, tempo, data, dados.descricao?.trim() || null, agoraIso(), dados.garminActivityId ?? null],
  );
}

export async function excluirRecorde(id: string): Promise<void> {
  const banco = await obterBanco();
  await banco.executar('DELETE FROM recorde_pessoal WHERE id = ?', [id]);
}

// ---------- importar recorde de uma atividade ----------

export interface CandidatoRecorde {
  garminActivityId: string | null;
  data: string;
  distanciaKm: number;
  duracaoSegundos: number;
  noApp: boolean; // já sincronizada (está no diário)
  inteira: boolean; // a atividade toda tem ~a distância do recorde
}

type BuscarGarmin = (inicio: string, fim: string) => Promise<AtividadeGarmin[]>;

// Corridas do período com pelo menos a distância pedida: as do diário e as
// do Garmin que nunca foram sincronizadas. As de ~mesma distância servem
// inteiras; as mais longas servem para procurar o melhor trecho no FIT.
export async function buscarCandidatosRecorde(
  inicio: string,
  fim: string,
  distanciaKm: number,
  buscarGarmin?: BuscarGarmin,
): Promise<{ candidatos: CandidatoRecorde[]; erroGarmin: string | null }> {
  const banco = await obterBanco();
  const minimo = distanciaKm * 0.98;
  const locais = await banco.todos<{ garmin_activity_id: string | null; data: string; distancia_km: number; duracao_segundos: number }>(
    `SELECT garmin_activity_id, data, distancia_km, duracao_segundos FROM treino_realizado
      WHERE data BETWEEN ? AND ? AND distancia_km >= ? AND duracao_segundos > 0`,
    [inicio, fim, minimo],
  );
  const candidatos: CandidatoRecorde[] = locais.map((l) => ({
    garminActivityId: l.garmin_activity_id,
    data: l.data,
    distanciaKm: l.distancia_km,
    duracaoSegundos: l.duracao_segundos,
    noApp: true,
    inteira: false,
  }));
  let erroGarmin: string | null = null;
  if (buscarGarmin) {
    try {
      const jaNoApp = new Set(candidatos.map((c) => c.garminActivityId));
      for (const a of await buscarGarmin(inicio, fim)) {
        const km = (a.distance ?? 0) / 1000;
        if (jaNoApp.has(String(a.activityId)) || km < minimo || !a.duration) continue;
        candidatos.push({
          garminActivityId: String(a.activityId),
          data: a.startTimeLocal.slice(0, 10),
          distanciaKm: km,
          duracaoSegundos: Math.round(a.duration),
          noApp: false,
          inteira: false,
        });
      }
    } catch (erro) {
      erroGarmin = erro instanceof Error ? erro.message : String(erro);
    }
  }
  for (const c of candidatos) c.inteira = c.distanciaKm <= distanciaKm * 1.06;
  // Mais rápidos primeiro (pelo pace da atividade).
  candidatos.sort((a, b) => a.duracaoSegundos / a.distanciaKm - b.duracaoSegundos / b.distanciaKm);
  return { candidatos, erroGarmin };
}
