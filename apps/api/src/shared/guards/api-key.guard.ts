import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { projects } from '@/entities/project/infrastructure/project.schema';
import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('API key required');
    }

    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.apiKeyHash, apiKeyHash));

    if (!project) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.project = project;
    return true;
  }
}
