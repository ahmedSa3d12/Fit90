import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ClassBookingsService } from './class-bookings.service';
import { CreateAdminMemberBookingDto } from './dto/admin-member-booking.dto';
import { AdminBookingsQueryDto } from './dto/admin-bookings-query.dto';
import { UpdateBookingAdditionalServicesDto } from './dto/class-booking.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin')
@RequiresPermission('club.fitness:view')
export class AdminClassBookingsController {
  constructor(private readonly service: ClassBookingsService) {}

  @Get('class-bookings')
  searchBookings(@Query() query: AdminBookingsQueryDto) {
    return this.service.searchAdminBookings(query);
  }

  @Get('class-schedule-slots/:slotId/bookings')
  slotBookings(@Param('slotId', ParseIntPipe) slotId: number) {
    return this.service.adminSlotBookings(slotId);
  }

  @Get('class-schedule-slots/:slotId/members/:memberId/free-sessions')
  memberFreeSessions(
    @Param('slotId', ParseIntPipe) slotId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.service.adminMemberFreeSessions(slotId, memberId);
  }

  @Get('class-schedule-slots/:slotId/additional-services/:serviceId/bookings')
  serviceBookings(
    @Param('slotId', ParseIntPipe) slotId: number,
    @Param('serviceId', ParseIntPipe) serviceId: number,
  ) {
    return this.service.adminServiceBookings(slotId, serviceId);
  }

  @Post('class-schedule-slots/:slotId/bookings')
  @RequiresPermission('club.fitness:create')
  createMemberBooking(
    @Param('slotId', ParseIntPipe) slotId: number,
    @Body() body: CreateAdminMemberBookingDto,
  ) {
    return this.service.adminCreateMemberBooking(slotId, body.memberId);
  }

  @Patch('bookings/:bookingId/cancel')
  @RequiresPermission('club.fitness:update')
  cancel(@Param('bookingId', ParseIntPipe) bookingId: number) {
    return this.service.adminTransitionBooking(bookingId, 'cancelled');
  }

  @Patch('bookings/:bookingId/complete')
  @RequiresPermission('club.fitness:update')
  complete(@Param('bookingId', ParseIntPipe) bookingId: number) {
    return this.service.adminTransitionBooking(bookingId, 'completed');
  }

  @Patch('bookings/:bookingId/no-show')
  @RequiresPermission('club.fitness:update')
  noShow(@Param('bookingId', ParseIntPipe) bookingId: number) {
    return this.service.adminTransitionBooking(bookingId, 'no_show');
  }

  @Patch('bookings/:bookingId/additional-services')
  @RequiresPermission('club.fitness:update')
  updateAdditionalServices(
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() body: UpdateBookingAdditionalServicesDto,
  ) {
    return this.service.adminUpdateBookingServices(bookingId, body);
  }
}
