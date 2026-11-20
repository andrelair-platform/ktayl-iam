import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/**
 * ADR-017 — a batch access-request: N roles (catalog UUIDs) submitted as one "demande". Each role still
 * gets its own two-leg four-eyes; the batch is a grouping under one trackable `batchId` instance.
 */
export class CreateBatchRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  roleIds!: string[];

  /** Optional human title for the batch (e.g. "Onboarding access for Jane"). */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;

  /** Optional — defaults to the signed-in user; only an admin may file on behalf of another matricule. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'requesterId must be a 6-digit matricule' })
  requesterId?: string;
}
