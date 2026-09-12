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
import { MosEntityService } from './mos-entity.service';
import { listEntityKeys } from './mos-entity.registry';
import { ListMosEntityDto } from './dto/list-mos-entity.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-mos/entities')
@RequiresPermission('mos:view', 'club.members:view')
export class MosEntitiesController {
  constructor(private readonly service: MosEntityService) {}

  @Get()
  registry() {
    return listEntityKeys();
  }

  @Get(':key/statistics')
  statistics(@Param('key') key: string, @Query() q: ListMosEntityDto) {
    return this.service.statistics(key, q);
  }

  @Get(':key')
  list(@Param('key') key: string, @Query() q: ListMosEntityDto) {
    return this.service.list(key, q);
  }

  @Get(':key/:id')
  findOne(@Param('key') key: string, @Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(key, id);
  }

  @Post('leads/:id/convert')
  @RequiresPermission('club.members:create')
  convertLead(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.convertLead(id, user);
  }

  @Post(':key')
  @RequiresPermission('club.members:create')
  create(@Param('key') key: string, @Body() body: Record<string, unknown>) {
    return this.service.create(key, body);
  }

  @Put(':key/:id')
  @RequiresPermission('club.members:update')
  update(
    @Param('key') key: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.update(key, id, body);
  }

  @Delete(':key/:id')
  @RequiresPermission('club.members:delete')
  remove(@Param('key') key: string, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(key, id);
  }

  @Patch('approve-decline/:id/:status')
  @RequiresPermission('club.members:update')
  patchApproval(
    @Param('id', ParseIntPipe) id: number,
    @Param('status') status: 'approved' | 'declined',
    @Body('reviewedBy') reviewedBy?: string,
  ) {
    return this.service.patchApproval(id, status, reviewedBy);
  }
}
