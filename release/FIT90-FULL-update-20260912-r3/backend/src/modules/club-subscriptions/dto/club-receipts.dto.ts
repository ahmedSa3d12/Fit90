import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubReceiptsDto extends PaginationDto {
  // Receipts default to 50/page (overrides PaginationDto's 20).
  @IsOptional()
  @Transform(({ value }) => (value != null ? parseInt(value, 10) : 50))
  @IsInt()
  @Min(1)
  @Max(200)
  override pageSize: number = 50;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  subscriptionId?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  memberId?: number;
}

export class CreateClubReceiptDto {
  @IsString()
  memberName!: string;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  receiptDate?: string;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  memberId?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? Number(value) : undefined))
  @IsInt()
  subscriptionId?: number;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(['cash', 'card', 'bank', 'online'])
  paymentMethod?: 'cash' | 'card' | 'bank' | 'online';

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateClubReceiptDto {
  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsIn(['cash', 'card', 'bank', 'online'])
  paymentMethod?: 'cash' | 'card' | 'bank' | 'online';
}
