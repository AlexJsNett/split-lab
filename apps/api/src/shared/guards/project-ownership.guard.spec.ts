import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectOwnershipGuard } from './project-ownership.guard';

function createMockContext(params: Record<string, string>, project?: unknown) {
  const request = { params, project };
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('ProjectOwnershipGuard', () => {
  let reflector: Reflector;
  let guard: ProjectOwnershipGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    guard = new ProjectOwnershipGuard(reflector);
  });

  it('passes through when the route has no @ProjectIdParam metadata', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const context = createMockContext(
      { projectId: 'project-1' },
      {
        id: 'project-1',
      },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes through when there is no authenticated project (e.g. a @Public() route)', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue('projectId');
    const context = createMockContext({ projectId: 'project-1' }, undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when the URL param does not match the authenticated project', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue('projectId');
    const context = createMockContext(
      { projectId: 'someone-elses-project' },
      {
        id: 'project-1',
      },
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('returns true when the URL param matches the authenticated project', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue('projectId');
    const context = createMockContext(
      { projectId: 'project-1' },
      {
        id: 'project-1',
      },
    );

    expect(guard.canActivate(context)).toBe(true);
  });

  it('reads the configured param name, not always "projectId" (e.g. manage-projects uses "id")', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue('id');
    const context = createMockContext(
      { id: 'project-1' },
      {
        id: 'project-1',
      },
    );

    expect(guard.canActivate(context)).toBe(true);
  });
});
