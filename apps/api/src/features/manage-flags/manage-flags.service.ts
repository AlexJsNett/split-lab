import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { featureFlags } from '@/entities/feature-flag/infrastructure/feature-flag.schema';
import { projects } from '@/entities/project/infrastructure/project.schema';
import { SearchIndexerService } from '@/search/search-indexer.service';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';

@Injectable()
export class ManageFlagsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly searchIndexer: SearchIndexerService,
  ) {}

  async create(projectId: string, dto: CreateFeatureFlagDto) {
    await this.assertProjectExists(projectId);

    const [flag] = await this.db
      .insert(featureFlags)
      .values({ projectId, ...dto })
      .returning();
    await this.searchIndexer.indexFlag(flag.id, {
      projectId: flag.projectId,
      type: 'flag',
      key: flag.key,
      description: flag.description,
      enabled: flag.enabled,
    });
    return flag;
  }

  async findAll(projectId: string) {
    await this.assertProjectExists(projectId);
    return this.db
      .select()
      .from(featureFlags)
      .where(eq(featureFlags.projectId, projectId));
  }

  async findOne(projectId: string, id: string) {
    const [flag] = await this.db
      .select()
      .from(featureFlags)
      .where(
        and(eq(featureFlags.id, id), eq(featureFlags.projectId, projectId)),
      );
    if (!flag) {
      throw new NotFoundException(`Flag ${id} not found`);
    }
    return flag;
  }

  async update(projectId: string, id: string, dto: UpdateFeatureFlagDto) {
    const [flag] = await this.db
      .update(featureFlags)
      .set(dto)
      .where(
        and(eq(featureFlags.id, id), eq(featureFlags.projectId, projectId)),
      )
      .returning();
    if (!flag) {
      throw new NotFoundException(`Flag ${id} not found`);
    }
    await this.searchIndexer.indexFlag(flag.id, {
      projectId: flag.projectId,
      type: 'flag',
      key: flag.key,
      description: flag.description,
      enabled: flag.enabled,
    });
    return flag;
  }

  async remove(projectId: string, id: string) {
    const deleted = await this.db
      .delete(featureFlags)
      .where(
        and(eq(featureFlags.id, id), eq(featureFlags.projectId, projectId)),
      )
      .returning();
    if (deleted.length === 0) {
      throw new NotFoundException(`Flag ${id} not found`);
    }
    await this.searchIndexer.removeFlag(id);
  }

  private async assertProjectExists(projectId: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
  }
}
