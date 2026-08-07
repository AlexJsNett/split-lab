import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { projects } from '@/entities/project/infrastructure/project.schema';
import type { Project } from '@/entities/project/domain/project';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createHash, randomBytes } from 'crypto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ManageProjectsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async create(dto: CreateProjectDto) {
    const apiKey = randomBytes(32).toString('hex');
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    const [project] = await this.db
      .insert(projects)
      .values({ name: dto.name, apiKeyHash })
      .returning();

    return { ...this.toResponse(project), apiKey };
  }

  async findAll(authenticatedProjectId: string) {
    const rows = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, authenticatedProjectId));
    return rows.map((project) => this.toResponse(project));
  }

  async findOne(id: string) {
    const [project] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id));
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return this.toResponse(project);
  }

  async update(id: string, dto: UpdateProjectDto) {
    const [project] = await this.db
      .update(projects)
      .set(dto)
      .where(eq(projects.id, id))
      .returning();
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return this.toResponse(project);
  }

  async remove(id: string) {
    const deleted = await this.db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning();
    if (deleted.length === 0) {
      throw new NotFoundException(`Project ${id} not found`);
    }
  }

  private toResponse(project: Project) {
    return { id: project.id, name: project.name };
  }
}
