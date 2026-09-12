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
import { MosLookupsService } from './mos-lookups.service';
import { UpsertMosLookupDto } from './dto/list-mos-entity.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-mos/lookups')
@RequiresPermission('mos:view', 'club.members:view')
export class MosLookupsController {
  constructor(private readonly service: MosLookupsService) {}

  @Get(':category')
  list(@Param('category') category: string) {
    return this.service.list(category);
  }

  @Post(':category')
  @RequiresPermission('club.members:create')
  create(@Param('category') category: string, @Body() body: UpsertMosLookupDto) {
    return this.service.create(category, body);
  }

  @Put(':category/:id')
  @RequiresPermission('club.members:update')
  update(
    @Param('category') category: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpsertMosLookupDto,
  ) {
    return this.service.update(category, id, body);
  }

  @Delete(':category/:id')
  @RequiresPermission('club.members:delete')
  remove(@Param('category') category: string, @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(category, id);
  }
}
