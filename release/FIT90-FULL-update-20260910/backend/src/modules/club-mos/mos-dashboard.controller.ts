import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { MosDashboardService } from './mos-dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('club-mos/dashboard')
@RequiresPermission('mos:view', 'club.dashboard:view', 'club.members:view')
export class MosDashboardController {
  constructor(private readonly service: MosDashboardService) {}

  @Get('analytics')
  analytics(@Query('days') days?: string, @Query('branchId') branchId?: string) {
    return this.service.analytics({
      days: days != null ? Number(days) : undefined,
      branchId: branchId != null && branchId !== 'all' ? Number(branchId) : undefined,
    });
  }

  @Get('sales')
  sales(
    @Query('month') month?: string,
    @Query('salesStaffId') salesStaffId?: string,
    @Query('approvedOnly') approvedOnly?: string,
  ) {
    return this.service.salesOverview({
      month,
      salesStaffId: salesStaffId != null && salesStaffId !== 'all' ? Number(salesStaffId) : undefined,
      approvedOnly: approvedOnly === 'true' || approvedOnly === '1',
    });
  }

  @Get('trainers')
  trainers(
    @Query('month') month?: string,
    @Query('trainerId') trainerId?: string,
    @Query('approvedOnly') approvedOnly?: string,
  ) {
    return this.service.trainerOverview({
      month,
      trainerId: trainerId != null && trainerId !== 'all' ? Number(trainerId) : undefined,
      approvedOnly: approvedOnly === 'true' || approvedOnly === '1',
    });
  }
}
