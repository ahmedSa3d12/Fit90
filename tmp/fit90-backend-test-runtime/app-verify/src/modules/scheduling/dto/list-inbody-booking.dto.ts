import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListInbodyBookingDto extends PaginationDto {
  @IsOptional()
  @IsIn(['booked', 'completed', 'cancelled', 'all'])
  status?: 'booked' | 'completed' | 'cancelled' | 'all';

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  branchId?: number;

  /** Exact booking date filter — yyyy-mm-dd. */
  @IsOptional()
  @IsString()
  bookingDate?: string;
}
