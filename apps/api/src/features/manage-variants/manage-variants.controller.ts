import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthProject } from '@/shared/decorators/auth-project.decorator';
import type { Project } from '@/entities/project/domain/project';
import { ManageVariantsService } from './manage-variants.service';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Controller('experiments/:experimentId/variants')
export class ManageVariantsController {
  constructor(private readonly manageVariantsService: ManageVariantsService) {}

  @Post()
  create(
    @AuthProject() project: Project,
    @Param('experimentId', ParseUUIDPipe) experimentId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.manageVariantsService.create(project.id, experimentId, dto);
  }

  @Get()
  findAll(
    @AuthProject() project: Project,
    @Param('experimentId', ParseUUIDPipe) experimentId: string,
  ) {
    return this.manageVariantsService.findAll(project.id, experimentId);
  }

  @Get(':id')
  findOne(
    @AuthProject() project: Project,
    @Param('experimentId', ParseUUIDPipe) experimentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manageVariantsService.findOne(project.id, experimentId, id);
  }

  @Patch(':id')
  update(
    @AuthProject() project: Project,
    @Param('experimentId', ParseUUIDPipe) experimentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.manageVariantsService.update(project.id, experimentId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @AuthProject() project: Project,
    @Param('experimentId', ParseUUIDPipe) experimentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manageVariantsService.remove(project.id, experimentId, id);
  }
}
