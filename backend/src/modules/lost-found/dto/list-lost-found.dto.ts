import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListLostFoundDto extends PaginationDto {
  @IsOptional()
  @IsIn(['stored', 'delivered', 'all'])
  status?: 'stored' | 'delivered' | 'all';

  @IsOptional()
  @IsString()
  branchId?: string;
}
