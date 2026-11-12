import { Banco, obterBanco } from '../db/banco';
import {
  FONTES_BEM_ESTAR,
  FonteBemEstar,
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
const DIAS_INICIAIS = 30; // primeira vez: último mês
const SOBREPOSICAO_DIAS = 2; // o sono da noite e o HRV chegam atrasados

export async function sincronizarBemEstar(
  banco: Banco,
  buscarJson: (caminho: string) => Promise<unknown>,
  hoje = new Date().toISOString().slice(0, 10),
): Promise<Partial<Record<FonteBemEstar, boolean>>> {
  const ultimo = await lerConfiguracao(CONFIG_ULTIMO_DIA);
  const inicio = ultimo ? somarDias(ultimo, -SOBREPOSICAO_DIAS) : somarDias(hoje, -DIAS_INICIAIS);
  const resultado: Partial<Record<FonteBemEstar, boolean>> = {};
  for (const [fonte, caminho] of Object.entries(FONTES_BEM_ESTAR) as [FonteBemEstar, (i: string, f: string) => string][]) {
    try {
      const dias = separarPorDia(await buscarJson(caminho(inicio, hoje)));
      for (const [data, registro] of dias) {
        await banco.executar(
          `INSERT INTO bem_estar_dia (data, fonte, json, buscado_em) VALUES (?, ?, ?, ?)
           ON CONFLICT(data, fonte) DO UPDATE SET json = excluded.json, buscado_em = excluded.buscado_em`,
          [data, fonte, JSON.stringify(podarJson(registro)), agoraIso()],
        );
      }
      resultado[fonte] = true;
    } catch {
      resultado[fonte] = false; // fonte indisponível não impede as outras
    }
  }
  if (Object.values(resultado).some(Boolean)) await gravarConfiguracao(CONFIG_ULTIMO_DIA, hoje);
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
    porDia.set(l.data, { ...(porDia.get(l.data) ?? {}), [l.fonte]: valor });
  }
  return [...porDia].map(([data, fontes]) => resumirDia(data, fontes));
}
