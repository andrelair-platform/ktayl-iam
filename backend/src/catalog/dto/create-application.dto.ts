import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { APP_TIERS, type AppTier } from '../entities/application.entity.js';

export class CreateApplicationDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsIn(APP_TIERS, { message: `tier must be one of: ${APP_TIERS.join(', ')}` })
  tier!: AppTier;

  @IsString()
  @Length(1, 160)
  authentikAppRef!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}
