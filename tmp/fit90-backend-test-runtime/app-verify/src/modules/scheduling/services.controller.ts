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
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtUser } from '../../common/types/jwt-user';
import { ExportService } from '../../common/export/export.service';
import { ServicesService } from './services.service';
import { ListServiceDto } from './dto/list-service.dto';
import { UpsertServiceDto } from './dto/upsert-service.dto';

@UseGuards(JwtAuthGuard)
@Controller('scheduling/services')
@RequiresPermission('club.fitness:view')
export class ServicesController {
  constructor(
    private readonly service: ServicesService,
    private readonly exportService: ExportService,
  ) {}

  @Get()
  list(@Query() query: ListServiceDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('export')
  @RequiresPermission('club.fitness:export')
  async export(
    @Query() query: ListServiceDto,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    query.page = 1;
    query.pageSize = 200;
    const result = await this.service.list(query, user);
    await this.exportService.sendXlsx(res, 'services.xlsx', [
      {
        name: 'Services',
        columns: [
          { key: 'id', header: 'ID', width: 8 },
          { key: 'name', header: 'Name', width: 28 },
          { key: 'category', header: 'Category', width: 14 },
          { key: 'durationMin', header: 'Duration (min)', width: 16 },
          { key: 'price', header: 'Price', width: 12 },
          { key: 'capacity', header: 'Capacity', width: 12 },
          { key: 'isActive', header: 'Active', width: 10 },
        ],
        rows: result.data,
      },
    ]);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  @RequiresPermission('club.fitness:create')
  create(@Body() body: UpsertServiceDto) {
    return this.service.create(body);
  }

  @Put(':id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpsertServiceDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
