import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/** A user requesting a role. The role is identified by its catalog UUID. */
export class CreateRequestDto {
  @IsUUID()
  roleId!: string;

  /**
   * The requester's matricule. Optional — defaults to the signed-in user. An admin may file a
   * request on behalf of another matricule (recorded as the requester; the actor is still audited).
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'requesterId must be a 6-digit matricule' })
  requesterId?: string;
}
