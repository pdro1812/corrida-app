import { obterBanco } from '../db/banco';
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

export async function criarRecorde(dados: { distanciaKm: string; tempo: string; data?: string; descricao?: string }) {
  const distancia = Number(dados.distanciaKm.replace(',', '.'));
  if (!Number.isFinite(distancia) || distancia <= 0 || distancia > 300) throw new Error('Informe a distância em km, ex: 21.1');
  const tempo = lerTempo(dados.tempo);
  if (!tempo) throw new Error('Use o formato H:MM:SS ou M:SS para o tempo');
  const data = dados.data?.trim() ? soData(dados.data) : null;
  const banco = await obterBanco();
  await banco.executar(
    'INSERT INTO recorde_pessoal (id, distancia_km, tempo_segundos, data, descricao, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
    [novoId(), distancia, tempo, data, dados.descricao?.trim() || null, agoraIso()],
  );
}

export async function excluirRecorde(id: string): Promise<void> {
  const banco = await obterBanco();
  await banco.executar('DELETE FROM recorde_pessoal WHERE id = ?', [id]);
}
