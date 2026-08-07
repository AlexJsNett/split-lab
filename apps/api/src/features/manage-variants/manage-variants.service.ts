import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { variants } from '@/entities/variant/infrastructure/variant.schema';
import { experiments } from '@/entities/experiment/infrastructure/experiment.schema';
import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Injectable()
export class ManageVariantsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(
    authenticatedProjectId: string,
    experimentId: string,
    dto: CreateVariantDto,
  ) {
    await this.assertExperimentExists(authenticatedProjectId, experimentId);

    const [variant] = await this.db
      .insert(variants)
      .values({ experimentId, ...dto })
      .returning();
    return variant;
  }

  async findAll(authenticatedProjectId: string, experimentId: string) {
    await this.assertExperimentExists(authenticatedProjectId, experimentId);
    return this.db
      .select()
      .from(variants)
      .where(eq(variants.experimentId, experimentId));
  }

  async findOne(
    authenticatedProjectId: string,
    experimentId: string,
    id: string,
  ) {
    await this.assertExperimentExists(authenticatedProjectId, experimentId);

    const [variant] = await this.db
      .select()
      .from(variants)
      .where(and(eq(variants.id, id), eq(variants.experimentId, experimentId)));
    if (!variant) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
    return variant;
  }

  async update(
    authenticatedProjectId: string,
    experimentId: string,
    id: string,
    dto: UpdateVariantDto,
  ) {
    await this.assertExperimentExists(authenticatedProjectId, experimentId);

    const [variant] = await this.db
      .update(variants)
      .set(dto)
      .where(and(eq(variants.id, id), eq(variants.experimentId, experimentId)))
      .returning();
    if (!variant) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
    return variant;
  }

  async remove(
    authenticatedProjectId: string,
    experimentId: string,
    id: string,
  ) {
    await this.assertExperimentExists(authenticatedProjectId, experimentId);

    const deleted = await this.db
      .delete(variants)
      .where(and(eq(variants.id, id), eq(variants.experimentId, experimentId)))
      .returning();
    if (deleted.length === 0) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
  }

  private async assertExperimentExists(
    authenticatedProjectId: string,
    experimentId: string,
  ) {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.id, experimentId));
    if (!experiment) {
      throw new NotFoundException(`Experiment ${experimentId} not found`);
    }
    if (experiment.projectId !== authenticatedProjectId) {
      throw new ForbiddenException(
        'This API key does not have access to that experiment',
      );
    }
  }
}
