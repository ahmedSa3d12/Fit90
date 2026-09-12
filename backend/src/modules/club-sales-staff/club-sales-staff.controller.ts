import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ClubSalesStaffService } from './club-sales-staff.service';
import { UpsertSalesStaffDto } from './dto/upsert-sales-staff.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-sales-staff')
@RequiresPermission('club.sales_staff:view')
export class ClubSalesStaffController {
  constructor(private readonly service: ClubSalesStaffService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @RequiresPermission('club.sales_staff:create')
  create(@Body() body: UpsertSalesStaffDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.sales_staff:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertSalesStaffDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.sales_staff:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
