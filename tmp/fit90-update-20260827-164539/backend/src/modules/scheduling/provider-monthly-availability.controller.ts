import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import {
  AddProviderAvailabilityWindowsDto,
  CancelProviderAvailabilityWindowDto,
  CreateProviderMonthlyAvailabilityDto,
  ListProviderMonthlyAvailabilityDto,
} from './dto/provider-monthly-availability.dto';
import { ProviderMonthlyAvailabilityService } from './provider-monthly-availability.service';

@UseGuards(JwtAuthGuard)
@Controller('scheduling/provider-monthly-availability')
@RequiresPermission('club.fitness:view')
export class ProviderMonthlyAvailabilityController {
  constructor(private readonly service: ProviderMonthlyAvailabilityService) {}

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: CreateProviderMonthlyAvailabilityDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Get()
  list(@Query() query: ListProviderMonthlyAvailabilityDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post(':id/windows')
  @RequiresPermission('club.fitness:create')
  addWindows(@Param('id', ParseIntPipe) id: number, @Body() body: AddProviderAvailabilityWindowsDto, @CurrentUser() user: JwtUser) {
    return this.service.addWindows(id, body, user);
  }

  @Patch(':id/windows/:windowId')
  @RequiresPermission('club.fitness:update')
  updateWindow(@Param('id', ParseIntPipe) id: number, @Param('windowId', ParseIntPipe) windowId: number, @Body() body: AddProviderAvailabilityWindowsDto, @CurrentUser() user: JwtUser) {
    return this.service.updateWindow(id, windowId, body, user);
  }

  @Delete(':id/windows/:windowId')
  @RequiresPermission('club.fitness:delete')
  deleteWindow(@Param('id', ParseIntPipe) id: number, @Param('windowId', ParseIntPipe) windowId: number, @CurrentUser() user: JwtUser) {
    return this.service.deleteWindow(id, windowId, user);
  }

  @Post(':id/windows/:windowId/cancel')
  @RequiresPermission('club.fitness:update')
  cancelWindow(@Param('id', ParseIntPipe) id: number, @Param('windowId', ParseIntPipe) windowId: number, @Body() body: CancelProviderAvailabilityWindowDto, @CurrentUser() user: JwtUser) {
    return this.service.cancelWindow(id, windowId, body.reason, user);
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
