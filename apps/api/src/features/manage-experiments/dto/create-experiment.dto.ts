import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateExperimentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  flagId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
