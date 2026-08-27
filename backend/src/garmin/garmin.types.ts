// Shape de resposta do endpoint não-documentado
// activity-service/activity/{id}/splits — não faz parte da API pública
// tipada do pacote garmin-connect, então definimos aqui só os campos
// que realmente usamos.
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
