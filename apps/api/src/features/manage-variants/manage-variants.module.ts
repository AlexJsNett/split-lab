import { Module } from '@nestjs/common';
import { ManageVariantsService } from './manage-variants.service';
import { ManageVariantsController } from './manage-variants.controller';
import { VariantModule } from '@/entities/variant/variant.module';
import { ExperimentModule } from '@/entities/experiment/experiment.module';

@Module({
  imports: [VariantModule, ExperimentModule],
  controllers: [ManageVariantsController],
  providers: [ManageVariantsService],
})
export class ManageVariantsModule {}
