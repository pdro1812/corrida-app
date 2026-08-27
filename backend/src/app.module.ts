import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { CiclosModule } from './ciclos/ciclos.module';
import { GarminModule } from './garmin/garmin.module';
import { HealthController } from './health/health.controller';
import { ImportModule } from './import/import.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProvasModule } from './provas/provas.module';
import { SemanasModule } from './semanas/semanas.module';
import { SyncModule } from './sync/sync.module';
import { TreinosModule } from './treinos/treinos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    CiclosModule,
    ProvasModule,
    SemanasModule,
    TreinosModule,
    ImportModule,
    GarminModule,
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
