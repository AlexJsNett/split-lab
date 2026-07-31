import { IsNotEmpty, IsString } from 'class-validator';

export class AssignVariantQueryDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
