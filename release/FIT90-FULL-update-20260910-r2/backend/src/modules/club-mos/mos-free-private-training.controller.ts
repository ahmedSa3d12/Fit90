import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { JwtUser } from '../../common/types/jwt-user';
import { ListFreePrivateTrainingDto } from './dto/list-free-private-training.dto';
import { MosFreePrivateTrainingService } from './mos-free-private-training.service';

@UseGuards(JwtAuthGuard)
@Controller('club-mos/free-private-training')
@RequiresPermission('mos:view', 'club.subscriptions:view')
export class MosFreePrivateTrainingController {
  constructor(private readonly service: MosFreePrivateTrainingService) {}

  @Get()
  list(@Query() query: ListFreePrivateTrainingDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Patch(':id/notes')
  @RequiresPermission('club.subscriptions:update')
  updateNotes(
    @Param('id', ParseIntPipe) id: number,
    @Body('notes') notes: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.updateNotes(id, notes, user);
  }
}
