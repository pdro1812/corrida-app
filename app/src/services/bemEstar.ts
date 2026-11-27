import { Banco, obterBanco } from '../db/banco';
import {
  FONTES_BEM_ESTAR,
  FonteBemEstar,
  enriquecerRegistro,
  podarJson,
  resumirDia,
  ResumoBemEstarDia,
  separarPorDia,
} from '../dominio/bemEstar';
import { lerConfiguracao, gravarConfiguracao } from './configuracoes';
import { agoraIso, somarDias } from './linhas';

// v2: baixa e guarda os dados diários de recuperação. A função de rede
// chega por parâmetro (o sync passa a dele, com token e timeout).

const CONFIG_ULTIMO_DIA = 'bem_estar_ultimo_dia';
const CONFIG_HISTORICO = 'bem_estar_historico_desde'; // primeiro dia já buscado
const DIAS_INICIAIS = 30; // primeira vez: último mês
const SOBREPOSICAO_DIAS = 2; // o sono da noite e o HRV chegam atrasados
// Os endpoints de estatística da Garmin (stress, HRV) recusam intervalos
// longos: cada pedido cobre no máximo 28 dias.
export const DIAS_POR_PEDIDO = 28;
const PEDIDOS_HISTORICO_POR_SYNC = 2; // histórico vem aos poucos, ~2 meses por sync
const HISTORICO_MAX_DIAS = 365;

// [inicio, fim] dividido em pedidos de no máximo `dias` dias, em ordem.
export function dividirPeriodo(inicio: string, fim: string, dias = DIAS_POR_PEDIDO): [string, string][] {
  const periodos: [string, string][] = [];
  for (let i = inicio; i <= fim; i = somarDias(i, dias)) {
    const f = somarDias(i, dias - 1);
    periodos.push([i, f < fim ? f : fim]);
  }
  return periodos;
}

export async function sincronizarBemEstar(
  banco: Banco,
  buscarJson: (caminho: string) => Promise<unknown>,
  hoje = new Date().toISOString().slice(0, 10),
): Promise<Partial<Record<FonteBemEstar, boolean>>> {
  const resultado: Partial<Record<FonteBemEstar, boolean>> = {};
  // Um período, todas as fontes. true se ao menos uma respondeu.
  const buscarPeriodo = async (inicio: string, fim: string): Promise<boolean> => {
    let algumaRespondeu = false;
    for (const [fonte, caminho] of Object.entries(FONTES_BEM_ESTAR) as [FonteBemEstar, (i: string, f: string) => string][]) {
      try {
        const dias = separarPorDia(await buscarJson(caminho(inicio, fim)));
        for (const [data, registro] of dias) {
          await banco.executar(
            `INSERT INTO bem_estar_dia (data, fonte, json, buscado_em) VALUES (?, ?, ?, ?)
             ON CONFLICT(data, fonte) DO UPDATE SET json = excluded.json, buscado_em = excluded.buscado_em`,
            [data, fonte, JSON.stringify(podarJson(enriquecerRegistro(fonte, registro))), agoraIso()],
          );
        }
        resultado[fonte] = true;
        algumaRespondeu = true;
      } catch {
        resultado[fonte] ??= false; // fonte indisponível não impede as outras
      }
    }
    return algumaRespondeu;
  };

  // Dias recentes (desde o último sync, com sobreposição).
  const ultimo = await lerConfiguracao(CONFIG_ULTIMO_DIA);
  const inicioRecente = ultimo ? somarDias(ultimo, -SOBREPOSICAO_DIAS) : somarDias(hoje, -DIAS_INICIAIS);
  let recenteOk = false;
  for (const [inicio, fim] of dividirPeriodo(inicioRecente, hoje)) {
    if (await buscarPeriodo(inicio, fim)) recenteOk = true;
  }
  if (!recenteOk) return resultado;
  await gravarConfiguracao(CONFIG_ULTIMO_DIA, hoje);

  // Histórico: volta até o primeiro treino, alguns pedidos por sync. Sem
  // marca (instalações antigas), começa antes dos dias recentes e refaz o
  // primeiro mês, que foi buscado num pedido só e pode ter ficado sem stress.
  const primeiroTreino = (await banco.primeiro<{ data: string | null }>('SELECT min(data) AS data FROM treino_realizado'))
    ?.data;
  if (!primeiroTreino) return resultado;
  const limite = somarDias(hoje, -HISTORICO_MAX_DIAS);
  const alvo = primeiroTreino > limite ? primeiroTreino : limite;
  let desde = (await lerConfiguracao(CONFIG_HISTORICO)) ?? inicioRecente;
  for (let n = 0; n < PEDIDOS_HISTORICO_POR_SYNC && desde > alvo; n++) {
    const fim = somarDias(desde, -1);
    const inicio = somarDias(desde, -DIAS_POR_PEDIDO) > alvo ? somarDias(desde, -DIAS_POR_PEDIDO) : alvo;
    if (!(await buscarPeriodo(inicio, fim))) break;
    desde = inicio;
  }
  await gravarConfiguracao(CONFIG_HISTORICO, desde);
  return resultado;
}

export async function listarBemEstar(desde: string): Promise<ResumoBemEstarDia[]> {
  const banco = await obterBanco();
  const linhas = await banco.todos<{ data: string; fonte: FonteBemEstar; json: string }>(
    'SELECT data, fonte, json FROM bem_estar_dia WHERE data >= ? ORDER BY data',
    [desde],
  );
  const porDia = new Map<string, Partial<Record<FonteBemEstar, unknown>>>();
  for (const l of linhas) {
    let valor: unknown = null;
    try {
      valor = JSON.parse(l.json);
    } catch {
      // linha corrompida: ignora a fonte
    }
    // Reaplica o enriquecimento: linhas gravadas antes dele também ganham
    // máximo/mínimo do Body Battery.
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      valor = enriquecerRegistro(l.fonte, valor as Record<string, unknown>);
    }
    porDia.set(l.data, { ...(porDia.get(l.data) ?? {}), [l.fonte]: valor });
  }
  return [...porDia].map(([data, fontes]) => resumirDia(data, fontes));
}
