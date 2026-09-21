import { IsOptional, IsString, Length } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  /** AC-4: a role must have an owner (approver #2) — required, non-empty. */
  @IsString()
  @Length(1, 32)
  owner!: string;

  @IsString()
  @Length(1, 160)
  authentikGroupRef!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}
