import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard';

type MockDb = { select: jest.Mock };

function createMockDb(): MockDb {
  return { select: jest.fn() };
}

function mockSelectWhere(db: MockDb, resolvedRows: unknown[]) {
  db.select.mockReturnValueOnce({
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(resolvedRows),
    }),
  });
}

type MockRequest = { headers: Record<string, unknown>; project?: unknown };

function createMockContext(headers: Record<string, unknown>) {
  const request: MockRequest = { headers };
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request, context };
}

describe('ApiKeyGuard', () => {
  let db: MockDb;
  let reflector: Reflector;
  let guard: ApiKeyGuard;

  beforeEach(() => {
    db = createMockDb();
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    guard = new ApiKeyGuard(reflector, db as never);
  });

  it('lets a @Public() route through without checking anything', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const { context } = createMockContext({});

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('throws UnauthorizedException when the header is missing', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    const { context } = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the header is sent more than once', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    const { context } = createMockContext({ 'x-api-key': ['a', 'b'] });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when no project matches the hash', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    mockSelectWhere(db, []);
    const { context } = createMockContext({ 'x-api-key': 'wrong-key' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('attaches the project to the request and returns true for a valid key', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    const project = { id: 'project-1', name: 'X', apiKeyHash: 'hash' };
    mockSelectWhere(db, [project]);
    const { context, request } = createMockContext({
      'x-api-key': 'real-key',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.project).toEqual(project);
  });
});
