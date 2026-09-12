import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ListQueryDto } from '../../common/dto/list-query.dto';
import { AttendanceService } from './attendance.service';
import { UpsertShiftDto } from './dto/shift.dto';
import { CheckPunchDto } from './dto/check.dto';
import { AttendanceReportDto } from './dto/report.dto';

@UseGuards(JwtAuthGuard)
@Controller('attendance')
@RequiresPermission('attendance:view')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // -------- rules / settings --------
  @Get('rules')
  getRules() {
    return this.attendance.getRules();
  }

  @Patch('rules')
  @RequiresPermission('attendance:update')
  patchRules(@Body() body: { rules?: unknown[] }) {
    return this.attendance.patchRules(body as Parameters<AttendanceService['patchRules']>[0]);
  }

  @Get('settings')
  getSettings() {
    return this.attendance.getSettings();
  }

  @Patch('settings')
  @RequiresPermission('attendance:update')
  patchSettings(@Body() body: { channels?: Record<string, boolean> }) {
    return this.attendance.patchSettings(body);
  }

  // -------- shifts (tbl_hdodr_setting) --------
  @Get('shifts')
  listShifts(@Query() query: PaginationDto) {
    return this.attendance.listShifts(query);
  }

  @Post('shifts')
  @RequiresPermission('attendance:create')
  createShift(@Body() dto: UpsertShiftDto) {
    return this.attendance.createShift(dto);
  }

  @Put('shifts/:id')
  @RequiresPermission('attendance:update')
  updateShift(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertShiftDto) {
    return this.attendance.updateShift(id, dto);
  }

  @Delete('shifts/:id')
  @RequiresPermission('attendance:delete')
  removeShift(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeShift(id);
  }

  // -------- reports (date-range + employee + branch) --------
  @Get('reports/basma')
  basmaReport(@Query() query: AttendanceReportDto) {
    return this.attendance.basmaReport(query);
  }

  @Get('reports/late')
  lateReport(@Query() query: AttendanceReportDto) {
    return this.attendance.lateReport(query);
  }

  // Recompute late_min for a date range from the current shift rules.
  @Post('reports/late/recalc')
  @RequiresPermission('attendance:update')
  recalcLate(@Body() body: { dateFrom?: string; dateTo?: string }) {
    return this.attendance.recalcLate(body.dateFrom ?? '', body.dateTo ?? '');
  }

  // -------- devices --------
  @Get('devices')
  listDevices(@Query() query: PaginationDto) {
    return this.attendance.listDevices(query);
  }

  @Post('devices')
  @RequiresPermission('attendance:create')
  createDevice(@Body() body: { title?: string; ip?: string; branchId?: number }) {
    return this.attendance.createDevice(body);
  }

  @Post('devices/sync-all')
  @RequiresPermission('attendance:update')
  syncAll() {
    return this.attendance.syncAllDevices();
  }

  @Post('devices/:id/sync')
  @RequiresPermission('attendance:update')
  syncDevice(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.syncDevice(id);
  }

  @Delete('devices/:id')
  @RequiresPermission('attendance:delete')
  removeDevice(@Param('id', ParseIntPipe) id: number) {
    return this.attendance.removeDevice(id);
  }

  // -------- punch + board --------
  @Post('check')
  @RequiresPermission('attendance:update')
  manualCheck(@Body() body: CheckPunchDto, @CurrentUser('sub') userId: number) {
    return this.attendance.manualCheck(body, userId);
  }

  @Get()
  board(@Query() query: ListQueryDto) {
    return this.attendance.board(query);
  }
}
