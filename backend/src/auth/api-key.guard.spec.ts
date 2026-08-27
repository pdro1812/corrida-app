import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  const expectedKey = 'secret-key';

  function buildContext(authHeader: string | undefined): ExecutionContext {
    const request = { headers: { authorization: authHeader } };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  function buildGuard(isPublic: boolean): ApiKeyGuard {
    const reflector = {
      getAllAndOverride: () => isPublic,
    } as unknown as Reflector;
    const configService = {
      get: () => expectedKey,
    } as unknown as ConfigService;
    return new ApiKeyGuard(reflector, configService);
  }

  it('allows public routes without checking the header', () => {
    const guard = buildGuard(true);
    expect(guard.canActivate(buildContext(undefined))).toBe(true);
  });

  it('allows requests with the correct Bearer token', () => {
    const guard = buildGuard(false);
    expect(guard.canActivate(buildContext(`Bearer ${expectedKey}`))).toBe(true);
  });

  it('rejects requests without an Authorization header', () => {
    const guard = buildGuard(false);
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects requests with the wrong token', () => {
    const guard = buildGuard(false);
    expect(() => guard.canActivate(buildContext('Bearer wrong-key'))).toThrow(
      UnauthorizedException,
    );
  });
});
