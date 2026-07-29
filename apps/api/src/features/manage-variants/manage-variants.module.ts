import { Module } from '@nestjs/common';
import { ManageVariantsService } from './manage-variants.service';
import { ManageVariantsController } from './manage-variants.controller';

@Module({
  controllers: [ManageVariantsController],
  providers: [ManageVariantsService],
})
export class ManageVariantsModule {}
