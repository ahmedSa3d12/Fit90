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
import { LostFoundService } from './lost-found.service';
import { UpsertLostFoundDto } from './dto/upsert-lost-found.dto';
import { ListLostFoundDto } from './dto/list-lost-found.dto';
import { DeliverLostFoundDto } from './dto/deliver-lost-found.dto';

@UseGuards(JwtAuthGuard)
@Controller('lost-found')
@RequiresPermission('club.lost_found:view')
export class LostFoundController {
  constructor(private readonly service: LostFoundService) {}

  @Get()
  list(@Query() query: ListLostFoundDto) {
    return this.service.list(query);
  }

  @Get('statistics')
  statistics(@Query('branchId') branchId?: string) {
    return this.service.statistics(branchId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.lost_found:create')
  create(@Body() body: UpsertLostFoundDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.lost_found:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertLostFoundDto) {
    return this.service.update(id, body);
  }

  @Patch(':id/deliver')
  @RequiresPermission('club.lost_found:update')
  deliver(@Param('id', ParseIntPipe) id: number, @Body() body: DeliverLostFoundDto) {
    return this.service.deliver(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.lost_found:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
