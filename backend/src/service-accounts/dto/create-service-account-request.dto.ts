import { ArrayNotEmpty, IsArray, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** File a request to create a governed service account (IGA-06 / S022). */
export class CreateServiceAccountRequestDto {
  /** The Authentik username to create (e.g. `ktayl-qa-finance`) — lowercase alphanumeric + hyphens. */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,118}$/, {
    message: 'name must be lowercase alphanumeric/hyphen (2-119 chars)',
  })
  name!: string;

  @IsString()
  @MaxLength(200)
  displayName!: string;

  @IsIn(['qa', 'm2m', 'automation'])
  type!: 'qa' | 'm2m' | 'automation';

  /** The accountable human owner (matricule) — also the owner-approval leg. */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'ownerMatricule must be a 6-digit matricule' })
  ownerMatricule!: string;

  /** The Authentik group(s) the account will carry (the GROUP_<name> authority). At least one. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  groupRefs!: string[];

  /** Why this privileged non-human identity is needed — mandatory audit reason. */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  justification!: string;
}
