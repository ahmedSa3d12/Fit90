import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class CreateAdminMemberBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  memberId!: number;
}
