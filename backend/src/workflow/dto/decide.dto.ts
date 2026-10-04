import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** An approver's decision on one leg of a request. */
export class DecideDto {
  @IsIn(['approved', 'denied'])
  decision!: 'approved' | 'denied';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  /**
   * DEV-ONLY (honoured only when ALLOW_APPROVER_OVERRIDE=true): the acting approver's matricule,
   * so four-eyes can be demoed from the single admin console. Ignored in prod (the signed-in user
   * is the approver). The server still enforces approver ≠ requester + must-match-an-assigned-leg.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'approver must be a 6-digit matricule' })
  approver?: string;
}
