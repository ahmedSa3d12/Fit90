import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateProviderMonthlyAvailabilityDto {
  @IsOptional() @IsIn(['nutrition', 'spa', 'personal_training'])
  category?: 'nutrition' | 'spa' | 'personal_training';

  @Type(() => Number) @IsInt() @Min(1)
  employeeId!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month!: number;

  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year!: number;
}

export class ListProviderMonthlyAvailabilityDto {
  @IsOptional() @IsIn(['nutrition', 'spa', 'personal_training'])
  category?: 'nutrition' | 'spa' | 'personal_training';

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  employeeId?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year?: number;

  @IsOptional() @IsIn(['draft', 'published', 'archived'])
  status?: 'draft' | 'published' | 'archived';
}

export class AddProviderAvailabilityWindowsDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  slotDate!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsOptional() @Type(() => Boolean) @IsBoolean()
  repeatWeekly?: boolean;

  @IsOptional() @IsDateString()
  bookingStartAt?: string;

  @IsOptional() @IsDateString()
  bookingEndAt?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  capacity?: number;
}

export class CancelProviderAvailabilityWindowDto {
  @IsString() @MaxLength(500)
  reason!: string;
}
