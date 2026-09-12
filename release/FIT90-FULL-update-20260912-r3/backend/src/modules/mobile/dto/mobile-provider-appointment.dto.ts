import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateMobileSpaProviderBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  availabilitySlotId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  startTime!: string;

  @IsOptional()
  @IsBoolean()
  joinWaitlist?: boolean;
}

export class CreateMobilePersonalTrainingProviderBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  availabilitySlotId!: number;

  @IsOptional()
  @IsBoolean()
  joinWaitlist?: boolean;
}

export class MobileProviderBookingScopeQueryDto {
  @IsOptional()
  @IsIn(['upcoming', 'past', 'all'])
  scope?: 'upcoming' | 'past' | 'all';
}
