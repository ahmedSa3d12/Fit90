import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerJwtGuard } from './customer-jwt.guard';
import type { CustomerJwt } from './customer-jwt.strategy';
import {
  CreateMobileNutritionBookingDto,
  MobileNutritionBookingsQueryDto,
  MobileNutritionEligibilityQueryDto,
  MobileNutritionScheduleQueryDto,
} from './dto/mobile-nutrition-appointment.dto';
import { MobileAppointmentsService } from './mobile-appointments.service';
import { MobileNutritionAppointmentsService } from './mobile-nutrition-appointments.service';

@Public()
@UseGuards(CustomerJwtGuard)
@Controller('mobile/app/nutrition')
export class MobileNutritionAppointmentsController {
  constructor(
    private readonly nutrition: MobileNutritionAppointmentsService,
    private readonly appointments: MobileAppointmentsService,
  ) {}

  @Get('services')
  services(@Req() req: Request) {
    const customer = req.user as CustomerJwt;
    return this.nutrition.services(customer.sub, customer.memberId);
  }

  @Get('providers')
  providers(@Req() req: Request) {
    const customer = req.user as CustomerJwt;
    return this.nutrition.providers(customer.sub, customer.memberId);
  }

  @Get('schedule')
  schedule(@Req() req: Request, @Query() query: MobileNutritionScheduleQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.nutrition.schedule(customer.sub, customer.memberId, query.serviceId, query.trainerId, query.year, query.month);
  }

  @Get('eligibility')
  eligibility(@Req() req: Request, @Query() query: MobileNutritionEligibilityQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.nutrition.eligibility(customer.sub, customer.memberId, query.serviceId, query.date);
  }

  @Post('bookings')
  createBooking(@Req() req: Request, @Body() body: CreateMobileNutritionBookingDto) {
    const customer = req.user as CustomerJwt;
    return this.nutrition.book(customer.sub, customer.memberId, body);
  }

  @Get('bookings/my')
  myBookings(@Req() req: Request, @Query() query: MobileNutritionBookingsQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.myBookings(customer.sub, customer.memberId, { ...query, category: 'nutrition' });
  }

  @Patch('bookings/:bookingId/cancel')
  cancelBooking(@Req() req: Request, @Param('bookingId', ParseIntPipe) bookingId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.cancelBooking(customer.sub, customer.memberId, bookingId, 'nutrition');
  }
}