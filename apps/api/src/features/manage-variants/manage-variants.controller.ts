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
import { ManageVariantsService } from './manage-variants.service';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Controller('experiments/:experimentId/variants')
export class ManageVariantsController {
  constructor(private readonly manageVariantsService: ManageVariantsService) {}

  @Post()
  create(
    @Param('experimentId', ParseUUIDPipe) experimentId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.manageVariantsService.create(experimentId, dto);
  }

  @Get()
  findAll(@Param('experimentId', ParseUUIDPipe) experimentId: string) {
    return this.manageVariantsService.findAll(experimentId);
  }

  @Get(':id')
  findOne(
    @Param('experimentId', ParseUUIDPipe) experimentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manageVariantsService.findOne(experimentId, id);
  }

  @Patch(':id')
  update(
    @Param('experimentId', ParseUUIDPipe) experimentId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.manageVariantsService.update(experimentId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('experimentId', ParseUUIDPipe) experimentId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manageVariantsService.remove(experimentId, id);
  }
}
