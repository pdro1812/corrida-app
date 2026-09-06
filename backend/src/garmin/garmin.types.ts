// Shape (parcial) de uma atividade retornada pelo Garmin Connect via
// garmin_client/session.py (comando "activities") — só os campos que
// realmente usamos. Definido localmente em vez de importar o tipo da lib,
// já que a autenticação agora passa por um subprocesso Python (ver
// garmin.service.ts) e não pela lib npm garmin-connect.
export interface GarminAtividadeDTO {
  activityId: number;
  activityName?: string;
  startTimeLocal: string;
  distance?: number; // metros
  duration?: number; // segundos
  averageSpeed?: number; // metros/segundo
  averageHR?: number;
  maxHR?: number;
  elevationGain?: number;
  lapCount?: number;
  activityType?: {
    typeKey?: string;
  };
}

// Shape de resposta do endpoint não-documentado
// activity-service/activity/{id}/splits — não faz parte da API pública
// do Garmin, então definimos aqui só os campos que realmente usamos.
export interface GarminLapDTO {
  lapIndex: number;
  distance?: number; // metros
  duration?: number; // segundos
  averageSpeed?: number; // metros/segundo
  averageHR?: number;
  intensityType?: string; // WARMUP | ACTIVE | REST | COOLDOWN
}

export interface GarminSplitsResponse {
  activityId: number;
  lapDTOs: GarminLapDTO[];
}
