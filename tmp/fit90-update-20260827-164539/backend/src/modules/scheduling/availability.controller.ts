import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { AvailabilityService } from './availability.service';
import { ListAvailabilityDto } from './dto/list-availability.dto';
import { UpsertSlotDto } from './dto/upsert-slot.dto';
import { GenerateMonthDto } from './dto/generate-month.dto';

@UseGuards(JwtAuthGuard)
@Controller('availability')
@RequiresPermission('club.fitness:view')
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  @Get()
  list(@Query() query: ListAvailabilityDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('available')
  available(
    @Query('moduleType') moduleType: string,
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
    @Query('trainerId') trainerId?: string,
  ) {
    return this.service.available(
      moduleType,
      date,
      branchId == null || branchId === '' ? undefined : parseInt(branchId, 10),
      trainerId == null || trainerId === '' ? undefined : parseInt(trainerId, 10),
    );
  }

  @Get('nutrition-times')
  nutritionTimes(
    @Query('serviceId') serviceId: string,
    @Query('trainerId') trainerId: string,
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.nutritionAvailableTimes(
      parseInt(serviceId, 10),
      parseInt(trainerId, 10),
      date,
      branchId == null || branchId === '' ? undefined : parseInt(branchId, 10),
    );
  }
  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: UpsertSlotDto, @CurrentUser() user: JwtUser) {
    return this.service.create(body, user);
  }

  @Post('generate-month')
  @RequiresPermission('club.fitness:create')
  generateMonth(@Body() body: GenerateMonthDto, @CurrentUser() user: JwtUser) {
    return this.service.generateMonth(body, user);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertSlotDto, @CurrentUser() user: JwtUser) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }
}
