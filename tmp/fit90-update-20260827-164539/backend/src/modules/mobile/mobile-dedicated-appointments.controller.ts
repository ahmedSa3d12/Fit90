import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerJwtGuard } from './customer-jwt.guard';
import type { CustomerJwt } from './customer-jwt.strategy';
import {
  CreateMobileAppointmentBookingDto,
  MobileDedicatedAppointmentBookingsQueryDto,
  MobileDedicatedAppointmentScheduleQueryDto,
  MobileDedicatedAppointmentTrainerQueryDto,
} from './dto/mobile-appointment.dto';
import { MobileAppointmentsService } from './mobile-appointments.service';

@Public()
@UseGuards(CustomerJwtGuard)
@Controller('mobile/app/spa')
export class MobileSpaAppointmentsController {
  constructor(private readonly appointments: MobileAppointmentsService) {}

  @Get('services')
  services() {
    return this.appointments.services('spa');
  }

  @Get('trainers')
  trainers(@Query() query: MobileDedicatedAppointmentTrainerQueryDto) {
    return this.appointments.trainers('spa', query.serviceId);
  }

  @Get('schedule')
  schedule(@Req() req: Request, @Query() query: MobileDedicatedAppointmentScheduleQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.monthlySchedule(customer.sub, customer.memberId, { ...query, category: 'spa' });
  }

  @Get('slots/:scheduleId')
  slot(@Req() req: Request, @Param('scheduleId', ParseIntPipe) scheduleId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.slot(customer.sub, customer.memberId, scheduleId, 'spa');
  }

  @Post('bookings')
  createBooking(@Req() req: Request, @Body() body: CreateMobileAppointmentBookingDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.createBooking(customer.sub, customer.memberId, body.scheduleId, 'spa');
  }

  @Get('bookings/my')
  myBookings(@Req() req: Request, @Query() query: MobileDedicatedAppointmentBookingsQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.myBookings(customer.sub, customer.memberId, { ...query, category: 'spa' });
  }

  @Patch('bookings/:bookingId/cancel')
  cancelBooking(@Req() req: Request, @Param('bookingId', ParseIntPipe) bookingId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.cancelBooking(customer.sub, customer.memberId, bookingId, 'spa');
  }
}

@Public()
@UseGuards(CustomerJwtGuard)
@Controller('mobile/app/personal-training')
export class MobilePersonalTrainingAppointmentsController {
  constructor(private readonly appointments: MobileAppointmentsService) {}

  @Get('services')
  services() {
    return this.appointments.services('personal_training');
  }

  @Get('trainers')
  trainers(@Query() query: MobileDedicatedAppointmentTrainerQueryDto) {
    return this.appointments.trainers('personal_training', query.serviceId);
  }

  @Get('schedule')
  schedule(@Req() req: Request, @Query() query: MobileDedicatedAppointmentScheduleQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.monthlySchedule(customer.sub, customer.memberId, {
      ...query,
      category: 'personal_training',
    });
  }

  @Get('slots/:scheduleId')
  slot(@Req() req: Request, @Param('scheduleId', ParseIntPipe) scheduleId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.slot(customer.sub, customer.memberId, scheduleId, 'personal_training');
  }

  @Post('bookings')
  createBooking(@Req() req: Request, @Body() body: CreateMobileAppointmentBookingDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.createBooking(customer.sub, customer.memberId, body.scheduleId, 'personal_training');
  }

  @Get('bookings/my')
  myBookings(@Req() req: Request, @Query() query: MobileDedicatedAppointmentBookingsQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.myBookings(customer.sub, customer.memberId, {
      ...query,
      category: 'personal_training',
    });
  }

  @Patch('bookings/:bookingId/cancel')
  cancelBooking(@Req() req: Request, @Param('bookingId', ParseIntPipe) bookingId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.cancelBooking(customer.sub, customer.memberId, bookingId, 'personal_training');
  }
}
