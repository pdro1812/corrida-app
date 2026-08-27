import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { DecimalInterceptor } from './common/decimal.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Uso pessoal, protegido por API key — CORS aberto não é um risco
  // relevante aqui, e deixa a porta aberta pra uma eventual versão web
  // do backend (ver docs/ARCHITECTURE.md §9).
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalInterceptors(new DecimalInterceptor());
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
