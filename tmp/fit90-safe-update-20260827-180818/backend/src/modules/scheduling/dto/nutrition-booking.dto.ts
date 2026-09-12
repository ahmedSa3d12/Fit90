import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class CreateNutritionBookingDto {
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt() @Min(1)
  availabilitySlotId!: number;

  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt() @Min(1)
  serviceId!: number;

  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt() @Min(1)
  memberId!: number;

  @IsString()
  @Matches(/^\d{2}:\d{2}(?::\d{2})?$/)
  startTime!: string;

  @IsOptional()
  @IsIn(['pending', 'confirmed'])
  status?: 'pending' | 'confirmed';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class NutritionEligibilityQueryDto {
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt() @Min(1)
  memberId!: number;

  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt() @Min(1)
  serviceId!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

export class RestoreNutritionEntitlementDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}
export class UpdateNutritionBookingStatusDto {
  @IsIn(['completed', 'cancelled', 'no_show'])
  status!: 'completed' | 'cancelled' | 'no_show';
}