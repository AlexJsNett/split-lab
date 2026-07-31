import { PrismaService } from '@/db/prisma.service';
import type { Project } from '@/entities/project/domain/project';
import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ManageProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProjectDto) {
    const apiKey = randomBytes(32).toString('hex');
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    const project = await this.prisma.project.create({
      data: { name: dto.name, apiKeyHash },
    });

    return { ...this.toResponse(project), apiKey };
  }

  async findAll() {
    const rows = await this.prisma.project.findMany();
    return rows.map((project) => this.toResponse(project));
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return this.toResponse(project);
  }

  async update(id: string, dto: UpdateProjectDto) {
    const [project] = await this.prisma.project.updateManyAndReturn({
      where: { id },
      data: dto,
    });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return this.toResponse(project);
  }

  async remove(id: string) {
    const { count } = await this.prisma.project.deleteMany({
      where: { id },
    });
    if (count === 0) {
      throw new NotFoundException(`Project ${id} not found`);
    }
  }

  private toResponse(project: Project) {
    return { id: project.id, name: project.name };
  }
}
