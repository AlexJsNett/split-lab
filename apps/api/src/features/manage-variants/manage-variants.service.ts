import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { variants } from '@/entities/variant/infrastructure/variant.schema';
import { experiments } from '@/entities/experiment/infrastructure/experiment.schema';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Injectable()
export class ManageVariantsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(experimentId: string, dto: CreateVariantDto) {
    await this.assertExperimentExists(experimentId);

    const [variant] = await this.db
      .insert(variants)
      .values({ experimentId, ...dto })
      .returning();
    return variant;
  }

  async findAll(experimentId: string) {
    await this.assertExperimentExists(experimentId);
    return this.db
      .select()
      .from(variants)
      .where(eq(variants.experimentId, experimentId));
  }

  async findOne(experimentId: string, id: string) {
    const [variant] = await this.db
      .select()
      .from(variants)
      .where(and(eq(variants.id, id), eq(variants.experimentId, experimentId)));
    if (!variant) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
    return variant;
  }

  async update(experimentId: string, id: string, dto: UpdateVariantDto) {
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

  async remove(experimentId: string, id: string) {
    const deleted = await this.db
      .delete(variants)
      .where(and(eq(variants.id, id), eq(variants.experimentId, experimentId)))
      .returning();
    if (deleted.length === 0) {
      throw new NotFoundException(`Variant ${id} not found`);
    }
  }

  private async assertExperimentExists(experimentId: string) {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(eq(experiments.id, experimentId));
    if (!experiment) {
      throw new NotFoundException(`Experiment ${experimentId} not found`);
    }
  }
}
