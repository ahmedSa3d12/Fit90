import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ClubAttendanceService } from './club-attendance.service';
import { CheckInDto, CheckOutDto } from './dto/check-in.dto';
import { ListClubAttendanceDto } from './dto/list-club-attendance.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-attendance')
@RequiresPermission('club.members:view')
export class ClubAttendanceController {
  constructor(private readonly service: ClubAttendanceService) {}

  @Post('check-in')
  @RequiresPermission('club.members:create')
  checkIn(@Body() body: CheckInDto, @CurrentUser('sub') userId: number) {
    return this.service.checkIn(body, userId);
  }

  @Post('check-out')
  @RequiresPermission('club.members:update')
  checkOut(@Body() body: CheckOutDto, @CurrentUser('sub') userId: number) {
    return this.service.checkOut(body, userId);
  }

  @Get('statistics')
  statistics(
    @Query('branch') branch?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.statistics({ branch, startDate, endDate });
  }

  @Get()
  list(@Query() query: ListClubAttendanceDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }
}
