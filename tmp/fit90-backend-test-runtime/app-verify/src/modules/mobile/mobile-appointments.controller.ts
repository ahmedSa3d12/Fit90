import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerJwtGuard } from './customer-jwt.guard';
import type { CustomerJwt } from './customer-jwt.strategy';
import {
  CreateMobileAppointmentBookingDto,
  MobileAppointmentBookingsQueryDto,
  MobileAppointmentCategoryQueryDto,
  MobileAppointmentScheduleQueryDto,
  MobileAppointmentTrainerQueryDto,
} from './dto/mobile-appointment.dto';
import { MobileAppointmentsService } from './mobile-appointments.service';

@Public()
@UseGuards(CustomerJwtGuard)
@Controller('mobile/app/appointments')
export class MobileAppointmentsController {
  constructor(private readonly appointments: MobileAppointmentsService) {}

  @Get('services')
  services(@Query() query: MobileAppointmentCategoryQueryDto) {
    return this.appointments.services(query.category);
  }

  @Get('trainers')
  trainers(@Query() query: MobileAppointmentTrainerQueryDto) {
    return this.appointments.trainers(query.category, query.serviceId);
  }

  @Get('schedule')
  schedule(@Req() req: Request, @Query() query: MobileAppointmentScheduleQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.monthlySchedule(customer.sub, customer.memberId, query);
  }

  @Get('slots/:scheduleId')
  slot(@Req() req: Request, @Param('scheduleId', ParseIntPipe) scheduleId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.slot(customer.sub, customer.memberId, scheduleId);
  }

  @Post('bookings')
  createBooking(@Req() req: Request, @Body() body: CreateMobileAppointmentBookingDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.createBooking(customer.sub, customer.memberId, body.scheduleId);
  }

  @Get('bookings/my')
  myBookings(@Req() req: Request, @Query() query: MobileAppointmentBookingsQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.myBookings(customer.sub, customer.memberId, query);
  }

  @Patch('bookings/:bookingId/cancel')
  cancelBooking(@Req() req: Request, @Param('bookingId', ParseIntPipe) bookingId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.cancelBooking(customer.sub, customer.memberId, bookingId);
  }
}
