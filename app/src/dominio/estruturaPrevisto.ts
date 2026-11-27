// Estrutura do treino a partir do texto do previsto ("3 km aq + 30 min
// contínuo (4:15 a 4:20) + 3 km volta"), para dividir a atividade em
// aquecimento / parte principal / volta quando o relógio não marcou as
// voltas (auto-lap por km). Lógica pura, sem I/O.

export type TipoSegmento = 'aq' | 'continuo' | 'tiro' | 'trote' | 'des';

export interface SegmentoPrevisto {
  tipo: TipoSegmento;
  metros?: number;
  segundos?: number;
  paceAlvoS?: [number, number]; // s/km [mais rápido, mais lento], se o texto trouxer
}

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const num = (s: string) => Number(s.replace(',', '.'));
const segundosDoPace = (mmss: string) => {
  const [m, s] = mmss.split(':').map(Number);
  return m * 60 + s;
};

// "(4:15 a 4:20)", "4:15-4:20", "@4:30" -> [rápido, lento] em s/km.
function paceAlvo(texto: string): [number, number] | undefined {
  const faixa = /(\d{1,2}:\d{2})\s*(?:a|-|–|ate)\s*(\d{1,2}:\d{2})/.exec(texto);
  if (faixa) {
    const a = segundosDoPace(faixa[1]);
    const b = segundosDoPace(faixa[2]);
    return [Math.min(a, b), Math.max(a, b)];
  }
  const unico = /(\d{1,2}:\d{2})/.exec(texto);
  if (unico) {
    const v = segundosDoPace(unico[1]);
    return [v, v];
  }
  return undefined;
}

// "3 km", "400m", "30 min", "12'", "90s" -> medida do trecho.
function medida(texto: string): { metros?: number; segundos?: number } | null {
  const km = /(\d+(?:[.,]\d+)?)\s*km\b/.exec(texto);
  if (km) return { metros: num(km[1]) * 1000 };
  const m = /(\d+(?:[.,]\d+)?)\s*m\b(?!in)/.exec(texto);
  if (m) return { metros: num(m[1]) };
  const min = /(\d+(?:[.,]\d+)?)\s*(?:min\b|minutos?\b|')/.exec(texto);
  if (min) return { segundos: num(min[1]) * 60 };
  const s = /(\d+)\s*(?:s|seg|segundos?|")\b/.exec(texto);
  if (s) return { segundos: num(s[1]) };
  return null;
}

export function parseEstruturaPrevisto(descricao: string | null | undefined): SegmentoPrevisto[] | null {
  if (!descricao) return null;
  const partesComPace = normalizar(descricao)
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  const partes = partesComPace.map((p) => p.replace(/\([^)]*\)/g, ' ').replace(/\d{1,2}:\d{2}/g, ' '));
  if (partes.length < 2) return null;

  const segmentos: SegmentoPrevisto[] = [];
  for (const [indice, parte] of partes.entries()) {
    const alvo = paceAlvo(partesComPace[indice]);
    const comAlvo = alvo ? { paceAlvoS: alvo } : {};
    const ehAq = /\baq\b|aquec/.test(parte);
    const ehDes = /\bvolta\b|desaq|\bdes\b|regenera/.test(parte);
    const series = /(\d+)\s*x\s*(\d+(?:[.,]\d+)?\s*(?:km|min|m|'|s))/.exec(parte);
    if (series && !ehAq && !ehDes) {
      const reps = Number(series[1]);
      const tiro = medida(series[2]);
      // recuperação: "c/ 3 min trote", "/ 200m trote", "pausa 90s"
      const resto = parte.slice(series.index + series[0].length);
      const rec = /(?:c\/|com|\/|pausa|intervalo|rec)\s*([^,;]+)/.exec(resto);
      const trote = rec ? medida(rec[1]) : null;
      if (!tiro || reps < 1 || reps > 40) return null;
      for (let i = 0; i < reps; i++) {
        segmentos.push({ tipo: 'tiro', ...tiro, ...comAlvo });
        if (trote && i < reps - 1) segmentos.push({ tipo: 'trote', ...trote });
      }
      continue;
    }
    const m = medida(parte);
    if (!m) return null; // parte sem medida: não dá para dividir com segurança
    segmentos.push({ tipo: ehAq ? 'aq' : ehDes ? 'des' : 'continuo', ...m, ...comAlvo });
  }
  // Só vale a pena quando há aquecimento ou volta separando a parte principal.
  const temPrincipal = segmentos.some((s) => s.tipo === 'continuo' || s.tipo === 'tiro');
  const temBorda = segmentos.some((s) => s.tipo === 'aq' || s.tipo === 'des');
  return temPrincipal && temBorda ? segmentos : null;
}

export interface PontoTrajeto {
  t: number; // s desde o início
  dist?: number; // m acumulados
  vel?: number; // m/s
}

export interface JanelaPrevista {
  tipo: TipoSegmento;
  inicio: number;
  fim: number;
}

const MOVIMENTO = 1.5;

// Divide a atividade pelos segmentos do previsto: cada fronteira começa no
// ponto nominal (distância ou tempo em movimento) e é ajustada, numa janela
// de ±90 s, para onde a velocidade realmente muda. Sem distância suficiente
// para cobrir a estrutura, devolve null (fica a divisão antiga).
export function dividirPeloPrevisto(pontos: PontoTrajeto[], segmentos: SegmentoPrevisto[]): JanelaPrevista[] | null {
  const pts = pontos.filter((p) => p.dist !== undefined).sort((a, b) => a.t - b.t);
  if (pts.length < 60 || segmentos.length < 2) return null;
  const inicio = pts[0].t;
  const fim = pts[pts.length - 1].t + 1;

  const velMedia = (de: number, ate: number) => {
    const trecho = pts.filter((p) => p.t >= de && p.t < ate);
    if (trecho.length < 2) return null;
    const d = (trecho[trecho.length - 1].dist as number) - (trecho[0].dist as number);
    const dt = trecho[trecho.length - 1].t - trecho[0].t;
    return dt > 0 ? d / dt : null;
  };
  const indiceEm = (t: number) => {
    let i = 0;
    while (i < pts.length - 1 && pts[i + 1].t <= t) i++;
    return i;
  };

  const janelas: JanelaPrevista[] = [];
  let cursor = inicio;
  for (let s = 0; s < segmentos.length - 1; s++) {
    const seg = segmentos[s];
    let nominal: number | null = null;
    const i0 = indiceEm(cursor);
    if (seg.metros !== undefined) {
      const alvo = (pts[i0].dist as number) + seg.metros;
      nominal = pts.find((p, i) => i >= i0 && (p.dist as number) >= alvo)?.t ?? null;
    } else if (seg.segundos !== undefined) {
      let mov = 0;
      for (let i = i0; i < pts.length - 1; i++) {
        const dt = Math.min(10, pts[i + 1].t - pts[i].t);
        if ((pts[i].vel ?? MOVIMENTO) >= MOVIMENTO) mov += dt;
        if (mov >= seg.segundos) {
          nominal = pts[i + 1].t;
          break;
        }
      }
    }
    if (nominal === null || nominal >= fim - 30) return null;

    // Ajuste fino: maior mudança de velocidade (60 s antes x 60 s depois)
    // no sentido esperado, perto do ponto nominal.
    const proximo = segmentos[s + 1];
    const acelera = intensidade(proximo.tipo) > intensidade(seg.tipo);
    const freia = intensidade(proximo.tipo) < intensidade(seg.tipo);
    let corte = nominal;
    if (acelera || freia) {
      const folga = seg.segundos !== undefined && seg.segundos < 180 ? 20 : 90;
      let melhor = 0;
      for (let t = Math.max(cursor + 30, nominal - folga); t <= Math.min(fim - 30, nominal + folga); t += 5) {
        const antes = velMedia(t - 60, t);
        const depois = velMedia(t, t + 60);
        if (antes === null || depois === null) continue;
        const ganho = acelera ? depois - antes : antes - depois;
        if (ganho > melhor) {
          melhor = ganho;
          corte = t;
        }
      }
    }
    janelas.push({ tipo: seg.tipo, inicio: cursor, fim: corte });
    cursor = corte;
  }
  janelas.push({ tipo: segmentos[segmentos.length - 1].tipo, inicio: cursor, fim });
  return janelas;
}

function intensidade(tipo: TipoSegmento): number {
  return tipo === 'tiro' ? 3 : tipo === 'continuo' ? 2 : 1;
}
