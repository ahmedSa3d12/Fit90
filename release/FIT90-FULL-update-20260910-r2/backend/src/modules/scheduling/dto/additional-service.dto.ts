import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateAdditionalServiceDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMin?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdditionalServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationMin?: number;
}

export class AdditionalServiceStatusDto {
  @IsIn(['active', 'inactive'])
  status!: 'active' | 'inactive';
}

export class ListAdditionalServicesDto {
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @IsOptional()
  @IsString()
  search?: string;
}

export class ClassAdditionalServiceDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  @IsBoolean()
  isRequired!: boolean;

  @IsBoolean()
  isActive!: boolean;
}

export class UpdateClassAdditionalServiceDto {
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SlotAdditionalServiceItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsBoolean()
  isRequired!: boolean;

  @IsBoolean()
  isActive!: boolean;
}

export class SetSlotAdditionalServicesDto {
  @IsArray()
  @ArrayUnique((item: SlotAdditionalServiceItemDto) => item.serviceId)
  @ValidateNested({ each: true })
  @Type(() => SlotAdditionalServiceItemDto)
  services!: SlotAdditionalServiceItemDto[];
}
