import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class ManageProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projectRepository: Repository<ProjectEntity>,
  ) {}

  async create(dto: CreateProjectDto) {
    const apiKey = randomBytes(32).toString('hex');
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    const project = await this.projectRepository.save(
      this.projectRepository.create({ name: dto.name, apiKeyHash }),
    );

    return { ...this.toResponse(project), apiKey };
  }

  async findAll() {
    const projects = await this.projectRepository.find();
    return projects.map((project) => this.toResponse(project));
  }

  async findOne(id: string) {
    const project = await this.projectRepository.findOneBy({ id });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return this.toResponse(project);
  }

  async update(id: string, dto: UpdateProjectDto) {
    const project = await this.projectRepository.preload({ id, ...dto });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }
    return this.toResponse(await this.projectRepository.save(project));
  }

  async remove(id: string) {
    const result = await this.projectRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Project ${id} not found`);
    }
  }

  private toResponse(project: ProjectEntity) {
    return { id: project.id, name: project.name };
  }
}
