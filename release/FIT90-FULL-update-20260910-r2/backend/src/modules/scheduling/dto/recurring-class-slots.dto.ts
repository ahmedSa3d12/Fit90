import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CLASS_SCHEDULE_SLOT_STATUSES,
  ClassScheduleSlotStatusValue,
} from './class-schedule-slot.dto';
import { SlotAdditionalServiceItemDto } from './additional-service.dto';

export class BookingEndRuleDto {
  @IsIn(['minutes_before_class'])
  type!: 'minutes_before_class';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  value!: number;
}

export class CreateRecurringClassSlotsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekDays!: number[];

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;

  @IsDateString({ strict: true })
  bookingStartAt!: string;

  /** Class start in the template week; used to preserve booking offsets. */
  @IsOptional()
  @IsDateString({ strict: true })
  templateStartAt?: string;

  /** Booking close in the template week; shifted by the same offset per occurrence. */
  @IsOptional()
  @IsDateString({ strict: true })
  bookingEndAt?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BookingEndRuleDto)
  bookingEndRule?: BookingEndRuleDto;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsIn(CLASS_SCHEDULE_SLOT_STATUSES)
  status!: ClassScheduleSlotStatusValue;

  @IsOptional()
  @IsArray()
  @ArrayUnique((item: SlotAdditionalServiceItemDto) => item.serviceId)
  @ValidateNested({ each: true })
  @Type(() => SlotAdditionalServiceItemDto)
  services?: SlotAdditionalServiceItemDto[];
}
