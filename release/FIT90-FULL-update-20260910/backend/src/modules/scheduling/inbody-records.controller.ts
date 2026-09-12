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
import { InbodyRecordsService } from './inbody-records.service';
import { ListInbodyRecordDto } from './dto/list-inbody-record.dto';
import { UpsertInbodyRecordDto } from './dto/upsert-inbody-record.dto';

@UseGuards(JwtAuthGuard)
@Controller('scheduling/inbody-records')
@RequiresPermission('club.fitness:view')
export class InbodyRecordsController {
  constructor(private readonly service: InbodyRecordsService) {}

  @Get()
  list(@Query() query: ListInbodyRecordDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('history/:memberId')
  history(@Param('memberId', ParseIntPipe) memberId: number) {
    return this.service.history(memberId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: UpsertInbodyRecordDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertInbodyRecordDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
