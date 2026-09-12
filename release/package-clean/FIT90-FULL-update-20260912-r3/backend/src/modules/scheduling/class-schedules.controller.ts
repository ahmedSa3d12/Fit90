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
  UseGuards,
} from '@nestjs/common';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import {
  CreateClassMonthlyScheduleDto,
  ListClassMonthlySchedulesDto,
} from './dto/class-monthly-schedule.dto';
import {
  CreateClassScheduleSlotDto,
  UpdateClassScheduleSlotDto,
} from './dto/class-schedule-slot.dto';
import { ClassSchedulesService } from './class-schedules.service';
import { CreateRecurringClassSlotsDto } from './dto/recurring-class-slots.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin')
@RequiresPermission('club.fitness:view')
export class ClassSchedulesController {
  constructor(private readonly service: ClassSchedulesService) {}

  @Post('class-schedules')
  @RequiresPermission('club.fitness:create')
  createSchedule(@Body() body: CreateClassMonthlyScheduleDto, @CurrentUser() user: JwtUser) {
    return this.service.createSchedule(body, user);
  }

  @Get('class-schedules')
  listSchedules(@Query() query: ListClassMonthlySchedulesDto, @CurrentUser() user: JwtUser) {
    return this.service.listSchedules(query, user);
  }

  @Get('class-schedules/:id')
  getSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.getSchedule(id, user);
  }

  @Post('class-schedules/:scheduleId/slots')
  @RequiresPermission('club.fitness:create')
  createSlot(
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Body() body: CreateClassScheduleSlotDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.createSlot(scheduleId, body, user);
  }

  @Post('class-schedules/:scheduleId/recurring-slots')
  @RequiresPermission('club.fitness:create')
  createRecurringSlots(
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Body() body: CreateRecurringClassSlotsDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.createRecurringSlots(scheduleId, body, user);
  }

  @Post('class-schedules/:scheduleId/copy-previous-month')
  @RequiresPermission('club.fitness:create')
  copyPreviousMonth(@Param('scheduleId', ParseIntPipe) scheduleId: number, @CurrentUser() user: JwtUser) {
    return this.service.copyPreviousMonth(scheduleId, user);
  }

  @Patch('class-schedule-slots/:slotId')
  @RequiresPermission('club.fitness:update')
  updateSlot(
    @Param('slotId', ParseIntPipe) slotId: number,
    @Body() body: UpdateClassScheduleSlotDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateSlot(slotId, body, user);
  }

  @Delete('class-schedule-slots/:slotId')
  @RequiresPermission('club.fitness:delete')
  deleteSlot(@Param('slotId', ParseIntPipe) slotId: number, @CurrentUser() user: JwtUser) {
    return this.service.deleteSlot(slotId, user);
  }

  @Patch('class-schedule-slots/:slotId/cancel')
  @RequiresPermission('club.fitness:update')
  cancelSlot(@Param('slotId', ParseIntPipe) slotId: number, @CurrentUser() user: JwtUser) {
    return this.service.cancelSlot(slotId, user);
  }

  @Patch('class-schedules/:id/publish')
  @RequiresPermission('club.fitness:update')
  publishSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.publishSchedule(id, user);
  }

  @Patch('class-schedules/:id/archive')
  @RequiresPermission('club.fitness:update')
  archiveSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.archiveSchedule(id, user);
  }

  @Delete('class-schedules/:id')
  @RequiresPermission('club.fitness:delete')
  deleteSchedule(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.deleteSchedule(id, user);
  }
}
