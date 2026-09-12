import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ClubCustomerSourcesService } from './club-customer-sources.service';
import { UpsertCustomerSourceDto } from './dto/upsert-customer-source.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-customer-sources')
@RequiresPermission('club.subscriptions:view')
export class ClubCustomerSourcesController {
  constructor(private readonly service: ClubCustomerSourcesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @RequiresPermission('club.subscriptions:create')
  create(@Body() body: UpsertCustomerSourceDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.subscriptions:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertCustomerSourceDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.subscriptions:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
