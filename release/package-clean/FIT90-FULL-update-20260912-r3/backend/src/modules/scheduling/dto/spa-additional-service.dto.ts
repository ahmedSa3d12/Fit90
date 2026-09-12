import { Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';

export class SpaServiceAdditionalItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  @IsBoolean()
  isRequired!: boolean;

  @IsBoolean()
  isActive!: boolean;
}

export class SetSpaServiceAdditionalDto {
  @IsArray()
  @ArrayUnique((item: SpaServiceAdditionalItemDto) => item.serviceId)
  @ValidateNested({ each: true })
  @Type(() => SpaServiceAdditionalItemDto)
  services!: SpaServiceAdditionalItemDto[];
}

export class SetAppointmentBookingAdditionalDto {
  @IsArray()
  @ArrayUnique()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  additionalServiceIds!: number[];
}

export class SetScheduleAdditionalServiceDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  additionalServiceId?: number | null;
}
