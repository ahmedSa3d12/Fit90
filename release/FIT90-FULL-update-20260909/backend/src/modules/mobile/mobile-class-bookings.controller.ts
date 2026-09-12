import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { ClassBookingsService } from '../scheduling/class-bookings.service';
import { CustomerJwtGuard } from './customer-jwt.guard';
import type { CustomerJwt } from './customer-jwt.strategy';
import {
  CreateMobileClassBookingDto,
  MobileClassScheduleQueryDto,
  MobileClassTrainerQueryDto,
  MobileMyClassBookingsQueryDto,
} from './dto/mobile-class-booking.dto';

@Public()
@UseGuards(CustomerJwtGuard)
@Controller('mobile/app/classes')
export class MobileClassBookingsController {
  constructor(private readonly bookings: ClassBookingsService) {}

  @Get('catalog')
  catalog() {
    return this.bookings.mobileClassCatalog();
  }

  @Get('trainers')
  trainers(@Query() query: MobileClassTrainerQueryDto) {
    return this.bookings.mobileClassTrainers(query.classId);
  }

  @Get('schedule')
  schedule(@Req() req: Request, @Query() query: MobileClassScheduleQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.bookings.mobileMonthlySchedule(customer.sub, customer.memberId, query);
  }

  @Get('notifications')
  notifications(@Req() req: Request) {
    const customer = req.user as CustomerJwt;
    return this.bookings.mobileClassNotifications(customer.sub, customer.memberId);
  }

  @Get('slots/:slotId')
  slot(@Req() req: Request, @Param('slotId', ParseIntPipe) slotId: number) {
    const customer = req.user as CustomerJwt;
    return this.bookings.mobileSlot(customer.sub, customer.memberId, slotId);
  }

  @Post('bookings')
  createBooking(@Req() req: Request, @Body() body: CreateMobileClassBookingDto) {
    const customer = req.user as CustomerJwt;
    return this.bookings.createMemberAppBooking(customer.sub, customer.memberId, body.slotId);
  }

  @Get('bookings/my')
  myBookings(@Req() req: Request, @Query() query: MobileMyClassBookingsQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.bookings.myMemberAppBookings(customer.sub, customer.memberId, query);
  }

  @Patch('bookings/:bookingId/cancel')
  cancelBooking(@Req() req: Request, @Param('bookingId', ParseIntPipe) bookingId: number) {
    const customer = req.user as CustomerJwt;
    return this.bookings.cancelMemberAppBooking(customer.sub, customer.memberId, bookingId);
  }
}
