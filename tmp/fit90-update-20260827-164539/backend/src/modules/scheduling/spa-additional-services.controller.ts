import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import {
  SetAppointmentBookingAdditionalDto,
  SetScheduleAdditionalServiceDto,
  SetSpaServiceAdditionalDto,
} from './dto/spa-additional-service.dto';
import { SpaAdditionalServicesService } from './spa-additional-services.service';

@UseGuards(JwtAuthGuard)
@Controller('scheduling/spa-additional-services')
@RequiresPermission('club.fitness:view')
export class SpaAdditionalServicesController {
  constructor(private readonly service: SpaAdditionalServicesService) {}

  @Get('services/:serviceId')
  serviceOptions(@Param('serviceId', ParseIntPipe) serviceId: number) {
    return this.service.getServiceOptions(serviceId);
  }

  @Put('services/:serviceId')
  @RequiresPermission('club.fitness:update')
  setServiceOptions(
    @Param('serviceId', ParseIntPipe) serviceId: number,
    @Body() body: SetSpaServiceAdditionalDto,
  ) {
    return this.service.setServiceOptions(serviceId, body.services);
  }

  @Get('schedules/:scheduleId')
  scheduleOptions(
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getScheduleOptions(scheduleId, user);
  }

  @Put('schedules/:scheduleId')
  @RequiresPermission('club.fitness:update')
  setScheduleOption(
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Body() body: SetScheduleAdditionalServiceDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.setScheduleOption(scheduleId, body.additionalServiceId ?? null, user);
  }

  @Get('bookings/:bookingId')
  bookingOptions(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.getBookingOptions(bookingId, user);
  }

  @Put('bookings/:bookingId')
  @RequiresPermission('club.fitness:update')
  setBookingOptions(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() body: SetAppointmentBookingAdditionalDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.setBookingOptions(bookingId, body.additionalServiceIds, user);
  }
}
