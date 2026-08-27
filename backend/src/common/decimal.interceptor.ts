import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

// Prisma.Decimal serializa como STRING em JSON (evita perda de precisão),
// mas os DTOs/tipos do app tratam esses campos como number. Converte
// recursivamente antes da resposta sair, num único lugar, em vez de
// espalhar Number(...) por cada service.
function converterDecimals(valor: unknown): unknown {
  if (valor instanceof Prisma.Decimal) {
    return valor.toNumber();
  }
  if (Array.isArray(valor)) {
    return valor.map(converterDecimals);
  }
  if (valor !== null && typeof valor === 'object' && !(valor instanceof Date)) {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, v]) => [chave, converterDecimals(v)]),
    );
  }
  return valor;
}

@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data: unknown) => converterDecimals(data)));
  }
}
