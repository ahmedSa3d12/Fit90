import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ClassBookingsService } from './class-bookings.service';
import {
  AvailableClassSlotsQueryDto,
  CreateClassBookingDto,
  MyClassBookingsQueryDto,
  UpdateBookingAdditionalServicesDto,
} from './dto/class-booking.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class ClassBookingsController {
  constructor(private readonly service: ClassBookingsService) {}

  @Get('class-schedules/available-slots')
  availableSlots(@Query() query: AvailableClassSlotsQueryDto) {
    return this.service.availableSlots(query);
  }

  @Post('bookings')
  create(@CurrentUser() user: JwtUser, @Body() body: CreateClassBookingDto) {
    return this.service.createBooking(user.sub, body);
  }

  @Get('bookings/my-bookings')
  myBookings(@CurrentUser() user: JwtUser, @Query() query: MyClassBookingsQueryDto) {
    return this.service.myBookings(user.sub, query);
  }

  @Patch('bookings/:id/cancel')
  cancel(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return this.service.cancelBooking(user.sub, id);
  }

  @Patch('bookings/:bookingId/additional-services')
  updateServices(
    @CurrentUser() user: JwtUser,
    @Param('bookingId', ParseIntPipe) bookingId: number,
    @Body() body: UpdateBookingAdditionalServicesDto,
  ) {
    return this.service.updateBookingServices(user.sub, bookingId, body);
  }
}
