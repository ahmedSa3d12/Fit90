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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { SchedulesService } from './schedules.service';
import { ListScheduleDto } from './dto/list-schedule.dto';
import { UpsertScheduleDto } from './dto/upsert-schedule.dto';
import { GenerateRecurringDto } from './dto/generate-recurring.dto';
import { GenerateBulkDto } from './dto/generate-bulk.dto';

@UseGuards(JwtAuthGuard)
@Controller('scheduling/schedules')
@RequiresPermission('club.fitness:view')
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @Get()
  list(@Query() query: ListScheduleDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('calendar')
  calendar(@Query() query: ListScheduleDto, @CurrentUser() user: JwtUser) {
    return this.service.calendar(query, user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: UpsertScheduleDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Post('generate/recurring')
  @RequiresPermission('club.fitness:create')
  generateRecurring(@Body() body: GenerateRecurringDto, @CurrentUser() user: JwtUser) {
    return this.service.generateRecurring(body, user);
  }

  @Post('generate/bulk')
  @RequiresPermission('club.fitness:create')
  generateBulk(@Body() body: GenerateBulkDto, @CurrentUser() user: JwtUser) {
    return this.service.generateBulk(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertScheduleDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Patch(':id/cancel')
  @RequiresPermission('club.fitness:update')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.cancel(id, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
