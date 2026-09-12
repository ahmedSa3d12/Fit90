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
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ClubClassesService } from './club-classes.service';
import { ListClubClassesDto } from './dto/list-club-classes.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-classes')
@RequiresPermission('club.fitness:view')
export class ClubClassesController {
  constructor(private readonly service: ClubClassesService) {}

  @Get()
  list(@Query() query: ListClubClassesDto) {
    return this.service.list(query);
  }

  @Get('statistics')
  statistics(
    @Query('branch') branch?: string,
    @Query('trainer') trainer?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.statistics({ branch, trainer, dateFrom, dateTo });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: Record<string, unknown>) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post(':id/enroll/:memberId')
  @RequiresPermission('club.fitness:create')
  enroll(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Query('waitlistIfFull') waitlistIfFull?: string,
    @Query('force') force?: string,
  ) {
    return this.service.enrollMember(id, memberId, {
      waitlistIfFull: waitlistIfFull === 'true' || waitlistIfFull === '1',
      force: force === 'true' || force === '1',
    });
  }

  @Get(':id/waitlist')
  waitlist(@Param('id', ParseIntPipe) id: number) {
    return this.service.listWaitlist(id);
  }

  @Delete(':id/waitlist/:memberId')
  @RequiresPermission('club.fitness:delete')
  removeWaitlist(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.service.removeFromWaitlist(id, memberId);
  }

  @Delete(':id/enroll/:memberId')
  @RequiresPermission('club.fitness:delete')
  unenroll(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.service.unenrollMember(id, memberId);
  }

  @Patch(':id/attendance/:memberId')
  @RequiresPermission('club.fitness:update')
  attendance(
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() body: { attendanceStatus?: string; attendanceTime?: string },
  ) {
    return this.service.updateAttendance(id, memberId, body);
  }
}
