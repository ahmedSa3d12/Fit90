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
import { ClubReceiptsCrudService } from './club-receipts-crud.service';
import {
  CreateClubReceiptDto,
  ListClubReceiptsDto,
  UpdateClubReceiptDto,
} from './dto/club-receipts.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-receipts')
@RequiresPermission('club.subscriptions:view')
export class ClubReceiptsController {
  constructor(private readonly service: ClubReceiptsCrudService) {}

  @Get('statistics')
  statistics() {
    return this.service.statistics();
  }

  @Get()
  list(@Query() q: ListClubReceiptsDto) {
    return this.service.list(q);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.subscriptions:create')
  create(@Body() body: CreateClubReceiptDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.subscriptions:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateClubReceiptDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.subscriptions:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
