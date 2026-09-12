import { IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

const toIntOrUndef = ({ value }: { value: unknown }) =>
  value == null || value === '' ? undefined : parseInt(String(value), 10);

export class ListInbodyRecordDto extends PaginationDto {
  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  memberId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  branchId?: number;

  /** Inclusive record-date range — yyyy-mm-dd. */
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
