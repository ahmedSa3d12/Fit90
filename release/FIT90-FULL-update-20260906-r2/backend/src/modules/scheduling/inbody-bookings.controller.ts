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
import { InbodyBookingsService } from './inbody-bookings.service';
import { ListInbodyBookingDto } from './dto/list-inbody-booking.dto';
import { UpsertInbodyBookingDto } from './dto/upsert-inbody-booking.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-inbody-bookings')
@RequiresPermission('club.fitness:view')
export class InbodyBookingsController {
  constructor(private readonly service: InbodyBookingsService) {}

  @Get()
  list(@Query() query: ListInbodyBookingDto) {
    return this.service.list(query);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: UpsertInbodyBookingDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertInbodyBookingDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
