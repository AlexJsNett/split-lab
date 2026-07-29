import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { experiments } from '@/entities/experiment/infrastructure/experiment.schema';
import { projects } from '@/entities/project/infrastructure/project.schema';
import { variants } from '@/entities/variant/infrastructure/variant.schema';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { CreateExperimentDto } from './dto/create-experiment.dto';
import { UpdateExperimentDto } from './dto/update-experiment.dto';

@Injectable()
export class ManageExperimentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(projectId: string, dto: CreateExperimentDto) {
    await this.assertProjectExists(projectId);

    const [experiment] = await this.db
      .insert(experiments)
      .values({ projectId, ...dto })
      .returning();
    return experiment;
  }

  async findAll(projectId: string) {
    await this.assertProjectExists(projectId);
    return this.db
      .select()
      .from(experiments)
      .where(eq(experiments.projectId, projectId));
  }

  async findOne(projectId: string, id: string) {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(and(eq(experiments.id, id), eq(experiments.projectId, projectId)));
    if (!experiment) {
      throw new NotFoundException(
        `Experiment ${id} not found in project ${projectId}`,
      );
    }
    return experiment;
  }

  async update(projectId: string, id: string, dto: UpdateExperimentDto) {
    const [experiment] = await this.db
      .select()
      .from(experiments)
      .where(and(eq(experiments.id, id), eq(experiments.projectId, projectId)));
    if (!experiment) {
      throw new NotFoundException(
        `Experiment ${id} not found in project ${projectId}`,
      );
    }

    if (dto.status === 'running') {
      const experimentVariants = await this.db
        .select()
        .from(variants)
        .where(eq(variants.experimentId, id));
      const totalWeight = experimentVariants.reduce(
        (sum, variant) => sum + variant.weight,
        0,
      );
      if (totalWeight !== 100) {
        throw new BadRequestException(
          `Total weight of variants must be 100, but got ${totalWeight}`,
        );
      }
    }

    const [updated] = await this.db
      .update(experiments)
      .set(dto)
      .where(eq(experiments.id, id))
      .returning();
    return updated;
  }

  async remove(projectId: string, id: string) {
    const deleted = await this.db
      .delete(experiments)
      .where(and(eq(experiments.id, id), eq(experiments.projectId, projectId)))
      .returning();
    if (deleted.length === 0) {
      throw new NotFoundException(`Experiment ${id} not found`);
    }
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
