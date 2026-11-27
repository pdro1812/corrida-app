import { Decoder, RecordMesg, SessionMesg, Stream } from '@garmin/fitsdk';

// v2: tudo que o arquivo FIT da atividade traz além dos laps — resumo da
// sessão (cadência, potência, dinâmica de corrida, Training Effect...) e
// métricas derivadas das amostras segundo a segundo (deriva cardíaca).
// Lógica pura, sem I/O.

export interface MetricasFit {
  horaInicio: string | null; // ISO 8601 (UTC)
  latitudeInicio: number | null; // graus
  longitudeInicio: number | null;
  cadenciaMediaPpm: number | null; // passos por minuto
  cadenciaMaxPpm: number | null;
  potenciaMediaW: number | null;
  potenciaNormalizadaW: number | null;
  oscilacaoVerticalMm: number | null;
  razaoVerticalPct: number | null;
  tempoContatoSoloMs: number | null;
  comprimentoPassadaM: number | null;
  calorias: number | null;
  temperaturaMediaC: number | null; // sensor do relógio (pulso aquece)
  descidaM: number | null;
  efeitoTreinoAerobico: number | null; // 0 a 5
  efeitoTreinoAnaerobico: number | null;
  cargaTreino: number | null;
  desacoplamentoPct: number | null; // ver calcularDesacoplamento
}

// Amostra mínima de um `record` do FIT usada nos cálculos.
export interface AmostraFit {
  segundos: number; // desde o início
  fc?: number;
  velocidade?: number; // m/s
}

const SEMICIRCULO_PARA_GRAUS = 180 / 2 ** 31;

const numero = (valor: unknown): number | null =>
  typeof valor === 'number' && Number.isFinite(valor) ? valor : null;

const arredondar = (valor: number | null, casas = 0): number | null => {
  if (valor === null) return null;
  const fator = 10 ** casas;
  return Math.round(valor * fator) / fator;
};

function graus(semicirculos: unknown): number | null {
  const valor = numero(semicirculos);
  return valor === null ? null : arredondar(valor * SEMICIRCULO_PARA_GRAUS, 5);
}

// Cadência de corrida no FIT vem em passadas/min (um pé); o Garmin Connect
// mostra passos/min, o dobro. A parte fracionária vem em campo separado.
function passosPorMinuto(inteira: unknown, fracionaria?: unknown): number | null {
  const valor = numero(inteira);
  if (valor === null) return null;
  return Math.round((valor + (numero(fracionaria) ?? 0)) * 2);
}

// Desacoplamento aeróbico (Pa:FC): compara a eficiência (velocidade / FC)
// da 1ª metade com a 2ª. Positivo = a FC subiu para o mesmo ritmo, ou seja,
// custou mais sustentar o treino. Abaixo de ~5% é considerado estável.
// Ignora os primeiros 10 min (aquecimento) e amostras paradas.
export function calcularDesacoplamento(amostras: AmostraFit[], ignorarInicioSegundos = 600): number | null {
  const validas = amostras.filter(
    (a) => a.segundos >= ignorarInicioSegundos && (a.fc ?? 0) > 0 && (a.velocidade ?? 0) > 0.5,
  );
  if (validas.length < 120) return null; // menos de ~2 min úteis: não confiável
  const meio = Math.floor(validas.length / 2);
  const eficiencia = (parte: AmostraFit[]) => {
    const velocidade = parte.reduce((soma, a) => soma + (a.velocidade ?? 0), 0) / parte.length;
    const fc = parte.reduce((soma, a) => soma + (a.fc ?? 0), 0) / parte.length;
    return velocidade / fc;
  };
  const primeira = eficiencia(validas.slice(0, meio));
  const segunda = eficiencia(validas.slice(meio));
  return arredondar(((primeira - segunda) / primeira) * 100, 1);
}

export function amostrasDosRecords(records: RecordMesg[]): AmostraFit[] {
  const comHora = records.filter((r) => r.timestamp instanceof Date);
  if (comHora.length === 0) return [];
  const inicio = (comHora[0].timestamp as Date).getTime();
  return comHora.map((r) => ({
    segundos: ((r.timestamp as Date).getTime() - inicio) / 1000,
    fc: numero(r.heartRate) ?? undefined,
    velocidade: numero(r.enhancedSpeed ?? r.speed) ?? undefined,
  }));
}

export function metricasDaSessao(sessao: SessionMesg | undefined, amostras: AmostraFit[]): MetricasFit {
  // Campos de corrida chegam como subcampos expandidos (avgRunningCadence)
  // ou no campo genérico, dependendo do relógio.
  const s = (sessao ?? {}) as Record<string, unknown>;
  const passadaMm = numero(s.avgStepLength);
  return {
    horaInicio: s.startTime instanceof Date ? s.startTime.toISOString() : null,
    latitudeInicio: graus(s.startPositionLat),
    longitudeInicio: graus(s.startPositionLong),
    cadenciaMediaPpm: passosPorMinuto(s.avgRunningCadence ?? s.avgCadence, s.avgFractionalCadence),
    cadenciaMaxPpm: passosPorMinuto(s.maxRunningCadence ?? s.maxCadence, s.maxFractionalCadence),
    potenciaMediaW: arredondar(numero(s.avgPower)),
    potenciaNormalizadaW: arredondar(numero(s.normalizedPower)),
    oscilacaoVerticalMm: arredondar(numero(s.avgVerticalOscillation), 1),
    razaoVerticalPct: arredondar(numero(s.avgVerticalRatio), 1),
    tempoContatoSoloMs: arredondar(numero(s.avgStanceTime)),
    comprimentoPassadaM: passadaMm === null ? null : arredondar(passadaMm / 1000, 2),
    calorias: arredondar(numero(s.totalCalories)),
    temperaturaMediaC: arredondar(numero(s.avgTemperature)),
    descidaM: arredondar(numero(s.totalDescent)),
    efeitoTreinoAerobico: arredondar(numero(s.totalTrainingEffect), 1),
    efeitoTreinoAnaerobico: arredondar(numero(s.totalAnaerobicTrainingEffect), 1),
    cargaTreino: arredondar(numero(s.trainingLoadPeak)),
    desacoplamentoPct: calcularDesacoplamento(amostras),
  };
}

export function extrairMetricasDoFit(fit: Uint8Array): MetricasFit {
  const { messages, errors } = new Decoder(Stream.fromBuffer(fit)).read();
  if (errors.length > 0) throw new Error(`Arquivo FIT inválido: ${String(errors[0])}`);
  const sessao = (messages.sessionMesgs ?? [])[0];
  return metricasDaSessao(sessao, amostrasDosRecords(messages.recordMesgs ?? []));
}
