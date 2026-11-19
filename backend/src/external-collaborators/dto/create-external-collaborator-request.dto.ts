import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** File a request to onboard a governed external collaborator (IGA-07 / S026). */
export class CreateExternalCollaboratorRequestDto {
  /** The Authentik username to create (e.g. `ext-acme-jdoe`) — lowercase alphanumeric + hyphens. */
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,118}$/, {
    message: 'name must be lowercase alphanumeric/hyphen (2-119 chars)',
  })
  name!: string;

  @IsString()
  @MaxLength(200)
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsIn(['contractor', 'auditor', 'broker', 'partner'])
  type!: 'contractor' | 'auditor' | 'broker' | 'partner';

  /**
   * The external **firm** they belong to (the ESN). **Leave blank for a freelance** collaborator. ADR-012:
   * this drives the ERPNext HR worker's `employment_type` (set → Prestataire, blank → Freelance) + the
   * `custom_agency_or_firm` field. The person is a *worker*, not a supplier.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  /** The accountable internal **sponsor** (matricule) — validated as an ACTIVE employee server-side. */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'sponsorMatricule must be a 6-digit matricule' })
  sponsorMatricule!: string;

  /** The SCOPED Authentik group(s) granted. At least one; never birthright-plus. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  groupRefs!: string[];

  /** Why this external party needs access — mandatory audit reason. */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  purpose!: string;

  /** Engagement length in days — capped at the hard ceiling (180) server-side; defaults to 90. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  expiryDays?: number;
}
