import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class MobileClassScheduleQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trainerId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  classId?: number;
}

export class MobileClassTrainerQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  classId?: number;
}

export class CreateMobileClassBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  slotId!: number;
}

export class MobileMyClassBookingsQueryDto {
  @IsOptional()
  @IsIn(['confirmed', 'wait', 'cancelled', 'completed', 'no_show'])
  status?: 'confirmed' | 'wait' | 'cancelled' | 'completed' | 'no_show';

  @IsOptional()
  @IsIn(['upcoming', 'past', 'all'])
  scope?: 'upcoming' | 'past' | 'all';
}
