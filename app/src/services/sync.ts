import { Banco, obterBanco } from '../db/banco';
import {
  AtividadeGarmin,
  ehAtividadeDeCorrida,
  extrairLapsDoZip,
  LapGarmin,
  mapearAtividade,
  mapearLapsParaIntervalos,
} from '../dominio/garmin';
import { ResultadoSincronizacao } from '../types/modelo';
import { gravarConfiguracao, lerConfiguracao, obterChaveGarmin } from './configuracoes';
import { agoraIso, novoId, somarDias } from './linhas';

// Garmin Connect Personal API (oficial, uso pessoal — docs/ARCHITECTURE.md
// §3). A chave é trocada por um access token (JWT, ~24h, sem refresh token);
// as chamadas de dados usam o token como Bearer.
const URL_BASE = 'https://personal.connectapi.garmin.com';
const CAMINHO_TOKEN = '/personalapitoken-service/personal-api/personal-api-key/token';
const TIMEOUT_MS = 30_000;
const MARGEM_RENOVACAO_MS = 60 * 60 * 1000;
const CONFIG_ULTIMA_SINCRONIZACAO = 'ultima_sincronizacao_garmin';

export class GarminError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'GarminError';
  }
}

let token: { valor: string; expiraEmMs: number } | null = null;

function comTimeout(): AbortSignal {
  const controle = new AbortController();
  setTimeout(() => controle.abort(), TIMEOUT_MS);
  return controle.signal;
}

// Só lê o claim `exp` para saber quando renovar — a Garmin valida a
// assinatura a cada chamada. Sem `exp` legível, assume 23h.
function expiracaoDoJwt(jwt: string): number {
  try {
    const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { exp } = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))) as { exp?: number };
    if (typeof exp === 'number') return exp * 1000;
  } catch {
    // formato inesperado — cai no padrão abaixo
  }
  return Date.now() + 23 * 60 * 60 * 1000;
}

async function obterToken(): Promise<string> {
  if (token && token.expiraEmMs - Date.now() > MARGEM_RENOVACAO_MS) return token.valor;

  const chave = await obterChaveGarmin();
  if (!chave) throw new GarminError('Configure a chave da Garmin em Configurações');

  const resposta = await fetch(URL_BASE + CAMINHO_TOKEN, {
    method: 'POST',
    headers: { Accept: '*/*', Authorization: `ApiKey ${chave}` },
    signal: comTimeout(),
  });
  if (resposta.status === 401 || resposta.status === 403) {
    throw new GarminError('Chave da Garmin inválida ou expirada — gere outra no Garmin Connect');
  }
  if (!resposta.ok) throw new GarminError(`Garmin respondeu HTTP ${resposta.status} ao autenticar`);

  const valor = (await resposta.text()).trim(); // JWT em texto puro, não JSON
  token = { valor, expiraEmMs: expiracaoDoJwt(valor) };
  return valor;
}

// Para testes e para trocar de chave sem reiniciar o app.
export function esquecerTokenGarmin(): void {
  token = null;
}

async function getGarmin(caminho: string, accept = 'application/json'): Promise<Response> {
  const resposta = await fetch(URL_BASE + caminho, {
    headers: { Accept: accept, Authorization: `Bearer ${await obterToken()}` },
    signal: comTimeout(),
  });
  if (resposta.status === 401) token = null; // revogado/expirado — pede outro na próxima
  if (!resposta.ok) throw new GarminError(`Garmin respondeu HTTP ${resposta.status}`);
  return resposta;
}

async function buscarAtividadesRecentes(limite: number): Promise<AtividadeGarmin[]> {
  const resposta = await getGarmin(`/activitylist-service/activities/search/activities?start=0&limit=${limite}`);
  return (await resposta.json()) as AtividadeGarmin[];
}

// Laps vêm do arquivo FIT original (a API não expõe splits em JSON). Falha
// em uma atividade não aborta o sync — ela entra sem intervalos.
async function buscarLaps(activityId: number): Promise<LapGarmin[]> {
  try {
    const resposta = await getGarmin(
      `/download-service/files/activity/${activityId}`,
      // Só 'application/zip' responde 406.
      'application/zip, application/x-zip-compressed, application/octet-stream',
    );
    return extrairLapsDoZip(new Uint8Array(await resposta.arrayBuffer()));
  } catch {
    return [];
  }
}

async function importarAtividade(banco: Banco, atividade: AtividadeGarmin): Promise<void> {
  const dados = mapearAtividade(atividade);
  const intervalos = (atividade.lapCount ?? 0) > 1 ? mapearLapsParaIntervalos(await buscarLaps(atividade.activityId)) : [];
  const id = novoId();
  await banco.transacao(async () => {
    await banco.executar(
      `INSERT INTO treino_realizado (id, garmin_activity_id, fonte, data, distancia_km, duracao_segundos, pace_medio,
         fc_media, fc_max, elevacao_m, sensacoes, criado_em)
       VALUES (?, ?, 'garmin', ?, ?, ?, ?, ?, ?, ?, '[]', ?)`,
      [
        id,
        dados.garminActivityId,
        dados.data,
        dados.distanciaKm,
        dados.duracaoSegundos,
        dados.paceMedio,
        dados.fcMedia,
        dados.fcMax,
        dados.elevacaoM,
        agoraIso(),
      ],
    );
    for (const intervalo of intervalos) {
      await banco.executar(
        `INSERT INTO treino_realizado_intervalo (id, treino_realizado_id, ordem, tipo, repeticao_numero, tempo_segundos,
           distancia_km, pace_medio, fc_media)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          novoId(),
          id,
          intervalo.ordem,
          intervalo.tipo,
          intervalo.repeticaoNumero,
          intervalo.tempoSegundos,
          intervalo.distanciaKm,
          intervalo.paceMedio,
          intervalo.fcMedia,
        ],
      );
    }
  });
}

const diasEntre = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

// RF15: casa cada realizado sem vínculo com o previsto mais próximo da
// mesma data (± 1 dia). Um previsto pode acumular mais de um realizado
// (ex: o Garmin dividiu o treino em duas atividades). Vínculos manuais
// nunca são desfeitos — só mexe em realizado sem vínculo.
export async function casarPendentesComPrevisto(banco: Banco): Promise<number> {
  const pendentes = await banco.todos<{ id: string; data: string }>(
    'SELECT id, data FROM treino_realizado WHERE treino_previsto_id IS NULL',
  );
  let casados = 0;
  for (const realizado of pendentes) {
    const candidatos = await banco.todos<{ id: string; data: string }>(
      'SELECT id, data FROM treino_previsto WHERE data BETWEEN ? AND ?',
      [somarDias(realizado.data, -1), somarDias(realizado.data, 1)],
    );
    if (candidatos.length === 0) continue;
    const maisProximo = candidatos.reduce((melhor, atual) =>
      diasEntre(atual.data, realizado.data) < diasEntre(melhor.data, realizado.data) ? atual : melhor,
    );
    await banco.transacao(async () => {
      await banco.executar('UPDATE treino_realizado SET treino_previsto_id = ? WHERE id = ?', [maisProximo.id, realizado.id]);
      await banco.executar("UPDATE treino_previsto SET status = 'realizado' WHERE id = ?", [maisProximo.id]);
    });
    casados++;
  }
  return casados;
}

// Importa as atividades recentes (RF12-RF14, idempotente por
// garmin_activity_id) e casa com o previsto (RF15). Nunca lança: falha de
// sync não pode derrubar o app (RNF12).
export async function sincronizarGarmin(limite = 20): Promise<ResultadoSincronizacao> {
  const vazio = { atividadesEncontradas: 0, atividadesImportadas: 0, atividadesJaExistentes: 0, treinosCasadosComPrevisto: 0 };
  try {
    const banco = await obterBanco();
    const atividades = await buscarAtividadesRecentes(limite);
    let atividadesImportadas = 0;
    let atividadesJaExistentes = 0;

    for (const atividade of atividades.filter(ehAtividadeDeCorrida)) {
      const existe = await banco.primeiro('SELECT id FROM treino_realizado WHERE garmin_activity_id = ?', [
        String(atividade.activityId),
      ]);
      if (existe) {
        atividadesJaExistentes++;
        continue;
      }
      await importarAtividade(banco, atividade);
      atividadesImportadas++;
    }

    const treinosCasadosComPrevisto = await casarPendentesComPrevisto(banco);
    await gravarConfiguracao(CONFIG_ULTIMA_SINCRONIZACAO, agoraIso());
    return {
      ok: true,
      atividadesEncontradas: atividades.length,
      atividadesImportadas,
      atividadesJaExistentes,
      treinosCasadosComPrevisto,
    };
  } catch (erro) {
    const mensagem =
      erro instanceof GarminError ? erro.message : 'Não foi possível falar com a Garmin — verifique a internet';
    return { ok: false, ...vazio, erro: mensagem };
  }
}

// Substitui o antigo cron diário: ao abrir o app, sincroniza se a última
// sincronização tiver mais de `horas` horas (e houver chave configurada).
export async function sincronizarSeNecessario(horas = 12): Promise<ResultadoSincronizacao | null> {
  if (!(await obterChaveGarmin())) return null;
  const ultima = await lerConfiguracao(CONFIG_ULTIMA_SINCRONIZACAO);
  if (ultima && Date.now() - Date.parse(ultima) < horas * 60 * 60 * 1000) return null;
  return sincronizarGarmin();
}

export async function ultimaSincronizacao(): Promise<string | null> {
  return lerConfiguracao(CONFIG_ULTIMA_SINCRONIZACAO);
}
