import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ExportService } from '../../common/export/export.service';
import { BookingsService } from './bookings.service';
import { ListBookingDto } from './dto/list-booking.dto';
import { CreateBookingDto, UpdateBookingDto } from './dto/upsert-booking.dto';
import { CreateNutritionBookingDto, NutritionEligibilityQueryDto, RestoreNutritionEntitlementDto, UpdateNutritionBookingStatusDto } from './dto/nutrition-booking.dto';
import { NutritionBookingsService } from './nutrition-bookings.service';

@UseGuards(JwtAuthGuard)
@Controller('scheduling/bookings')
@RequiresPermission('club.fitness:view')
export class BookingsController {
  constructor(
    private readonly service: BookingsService,
    private readonly nutritionBookings: NutritionBookingsService,
    private readonly exportService: ExportService,
  ) {}

  @Get()
  list(@Query() query: ListBookingDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('export')
  @RequiresPermission('club.fitness:export')
  async export(
    @Query() query: ListBookingDto,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    query.page = 1;
    query.pageSize = 200;
    const result = await this.service.list(query, user);
    await this.exportService.sendXlsx(res, 'bookings.xlsx', [
      {
        name: 'Bookings',
        columns: [
          { key: 'bookingNumber', header: 'Booking #', width: 16 },
          { key: 'memberName', header: 'Member', width: 24 },
          { key: 'serviceName', header: 'Service', width: 22 },
          { key: 'category', header: 'Category', width: 14 },
          { key: 'bookingDate', header: 'Date', width: 14 },
          { key: 'startTime', header: 'Start', width: 10 },
          { key: 'endTime', header: 'End', width: 10 },
          { key: 'status', header: 'Status', width: 14 },
        ],
        rows: result.data,
      },
    ]);
  }

  @Get('schedules/:scheduleId/members/:memberId/free-spa-sessions')
  spaFreeSessions(
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.memberSpaFreeSessions(scheduleId, memberId, user);
  }

  @Get('nutrition/eligibility')
  nutritionEligibility(@Query() query: NutritionEligibilityQueryDto) {
    return this.nutritionBookings.eligibility(query.memberId, query.serviceId, query.date);
  }

  @Post('nutrition')
  @RequiresPermission('club.fitness:create')
  createNutrition(@Body() body: CreateNutritionBookingDto, @CurrentUser() user: JwtUser) {
    return this.nutritionBookings.create(body, user);
  }

  @Patch('nutrition/:id/status')
  @RequiresPermission('club.fitness:update')
  transitionNutritionStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateNutritionBookingStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.nutritionBookings.transitionStatus(id, body.status, user);
  }

  @Post('nutrition/:id/restore-no-show')
  @RequiresPermission('club.fitness:update')
  restoreNutritionNoShow(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: RestoreNutritionEntitlementDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.nutritionBookings.restoreNoShow(id, body.reason, user);
  }
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: CreateBookingDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Patch(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateBookingDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
