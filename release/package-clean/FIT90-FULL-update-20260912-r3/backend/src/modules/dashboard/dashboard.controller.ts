import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(
    @CurrentUser() user: JwtUser,
    @Query('branch') branch?: string,
    @Query('manWomen') manWomen?: string,
  ) {
    const parsedBranch = branch === 'all' || branch == null ? 'all' : Number(branch);
    const parsedManWomen = manWomen != null && manWomen !== '' ? Number(manWomen) : undefined;
    return this.dashboard.getSummary(user, parsedBranch, parsedManWomen);
  }
}
