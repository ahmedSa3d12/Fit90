import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import {
  CreateServiceMonthlyScheduleDto,
  ListServiceMonthlySchedulesDto,
} from './dto/service-monthly-schedule.dto';
import { ServiceMonthlySchedulesService } from './service-monthly-schedules.service';

@UseGuards(JwtAuthGuard)
@Controller('scheduling/monthly-schedules')
@RequiresPermission('club.fitness:view')
export class ServiceMonthlySchedulesController {
  constructor(private readonly service: ServiceMonthlySchedulesService) {}

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: CreateServiceMonthlyScheduleDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Get()
  list(@Query() query: ListServiceMonthlySchedulesDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Patch(':id/publish')
  @RequiresPermission('club.fitness:update')
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.publish(id, user);
  }

  @Patch(':id/archive')
  @RequiresPermission('club.fitness:update')
  archive(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.archive(id, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
