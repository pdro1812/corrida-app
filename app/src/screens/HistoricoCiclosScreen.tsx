import { useCallback, useState } from 'react';
import { FlatList, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ciclo, provaAlvoDoCiclo } from '../types/api';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';
import { listarCiclos } from '../services/ciclos';
import { formatarData, formatarDuracao } from '../utils/formato';
import { cores, espacamento, tipografia } from '../theme/theme';

export function HistoricoCiclosScreen() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelado = false;
      setCarregando(true);
      listarCiclos('concluido')
        .then((resultado) => {
          if (!cancelado) setCiclos(resultado);
        })
        .catch((erroCapturado) => setErro(String(erroCapturado)))
        .finally(() => {
          if (!cancelado) setCarregando(false);
        });
      return () => {
        cancelado = true;
      };
    }, []),
  );

  if (carregando) {
    return <LoadingState />;
  }

  return (
    <Screen>
      {erro ? <Banner tipo="erro" titulo="Erro ao carregar histórico" mensagem={erro} /> : null}
      <FlatList
        data={ciclos}
        keyExtractor={(ciclo) => ciclo.id}
        renderItem={({ item }) => {
          const provaAlvo = provaAlvoDoCiclo(item);
          return (
            <Card style={{ marginBottom: espacamento.sm }}>
              <Text style={tipografia.subtitulo}>{item.nome}</Text>
              {provaAlvo ? <Text style={tipografia.legenda}>{provaAlvo.nome}</Text> : null}
              <Text style={tipografia.legenda}>
                {formatarData(item.dataInicio)} — {formatarData(item.dataFim)}
              </Text>
              {provaAlvo?.concluida ? (
                <Text style={[tipografia.corpoForte, { color: cores.sucesso, marginTop: espacamento.xs }]}>
                  🏁 {formatarDuracao(provaAlvo.resultadoTempoSegundos)}
                  {provaAlvo.resultadoPace ? ` · ${provaAlvo.resultadoPace}/km` : ''}
                </Text>
              ) : null}
            </Card>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            emoji="🗄️"
            titulo="Nenhum ciclo concluído ainda"
            descricao="Ciclos concluídos aparecem aqui pra você acompanhar seu histórico."
          />
        }
      />
    </Screen>
  );
}
