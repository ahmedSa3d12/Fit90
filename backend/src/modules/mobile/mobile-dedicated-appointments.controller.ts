import { Body, Controller, Get, Headers, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CustomerJwtGuard } from './customer-jwt.guard';
import type { CustomerJwt } from './customer-jwt.strategy';
import {
  CreateMobilePersonalTrainingProviderBookingDto,
  CreateMobileSpaProviderBookingDto,
  MobileProviderBookingScopeQueryDto,
} from './dto/mobile-provider-appointment.dto';
import { MobileProviderAppointmentsService } from './mobile-provider-appointments.service';

@Public()
@UseGuards(CustomerJwtGuard)
@Controller('mobile/app/spa')
export class MobileSpaAppointmentsController {
  constructor(private readonly appointments: MobileProviderAppointmentsService) {}

  @Get('monthly-schedules')
  schedules(@Req() req: Request) {
    const customer = req.user as CustomerJwt;
    return this.appointments.publishedPlans(customer.sub, customer.memberId, 'spa', 15);
  }

  @Get('monthly-schedules/:planId')
  schedule(@Req() req: Request, @Param('planId', ParseIntPipe) planId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.plan(customer.sub, customer.memberId, 'spa', planId);
  }

  @Get('windows/:windowId/services')
  services(@Req() req: Request, @Param('windowId', ParseIntPipe) windowId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.windowForServices(customer.sub, customer.memberId, windowId);
  }

  @Get('windows/:windowId/services/:serviceId/eligibility')
  eligibility(
    @Req() req: Request,
    @Param('windowId', ParseIntPipe) windowId: number,
    @Param('serviceId', ParseIntPipe) serviceId: number,
    @Headers('accept-language') language?: string,
  ) {
    const customer = req.user as CustomerJwt;
    return this.appointments.spaEligibility(customer.sub, customer.memberId, windowId, serviceId, language);
  }

  @Get('windows/:windowId/services/:serviceId/times')
  times(
    @Req() req: Request,
    @Param('windowId', ParseIntPipe) windowId: number,
    @Param('serviceId', ParseIntPipe) serviceId: number,
  ) {
    const customer = req.user as CustomerJwt;
    return this.appointments.spaAvailableTimes(customer.sub, customer.memberId, windowId, serviceId);
  }

  @Post('bookings')
  createBooking(@Req() req: Request, @Body() body: CreateMobileSpaProviderBookingDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.bookSpa(customer.sub, customer.memberId, body);
  }

  @Get('bookings/my')
  myBookings(@Req() req: Request, @Query() query: MobileProviderBookingScopeQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.myBookings(customer.sub, customer.memberId, 'spa', query.scope);
  }

  @Patch('bookings/:bookingId/cancel')
  cancelBooking(@Req() req: Request, @Param('bookingId', ParseIntPipe) bookingId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.cancelBooking(customer.sub, customer.memberId, 'spa', bookingId);
  }
}

@Public()
@UseGuards(CustomerJwtGuard)
@Controller('mobile/app/personal-training')
export class MobilePersonalTrainingAppointmentsController {
  constructor(private readonly appointments: MobileProviderAppointmentsService) {}

  @Get('monthly-schedules')
  schedules(@Req() req: Request) {
    const customer = req.user as CustomerJwt;
    return this.appointments.publishedPlans(customer.sub, customer.memberId, 'personal_training', 20);
  }

  @Get('monthly-schedules/:planId')
  schedule(@Req() req: Request, @Param('planId', ParseIntPipe) planId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.plan(customer.sub, customer.memberId, 'personal_training', planId);
  }

  @Get('windows/:windowId/eligibility')
  eligibility(@Req() req: Request, @Param('windowId', ParseIntPipe) windowId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.personalTrainingEligibility(customer.sub, customer.memberId, windowId);
  }

  @Post('bookings')
  createBooking(@Req() req: Request, @Body() body: CreateMobilePersonalTrainingProviderBookingDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.bookPersonalTraining(customer.sub, customer.memberId, body);
  }

  @Get('bookings/my')
  myBookings(@Req() req: Request, @Query() query: MobileProviderBookingScopeQueryDto) {
    const customer = req.user as CustomerJwt;
    return this.appointments.myBookings(customer.sub, customer.memberId, 'personal_training', query.scope);
  }

  @Patch('bookings/:bookingId/cancel')
  cancelBooking(@Req() req: Request, @Param('bookingId', ParseIntPipe) bookingId: number) {
    const customer = req.user as CustomerJwt;
    return this.appointments.cancelBooking(customer.sub, customer.memberId, 'personal_training', bookingId);
  }
}
