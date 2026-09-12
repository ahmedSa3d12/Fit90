import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListClubTrainersDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  /** Limit the roster to trainers linked to employees with this job title. */
  @IsOptional()
  @IsString()
  jobTitle?: string;

  /** Gym providers are linked to an employee; external providers are standalone records. */
  @IsOptional()
  @IsIn(['gym', 'external'])
  providerType?: 'gym' | 'external';
}
