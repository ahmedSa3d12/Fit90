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
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdditionalServicesService } from './additional-services.service';
import {
  AdditionalServiceStatusDto,
  ClassAdditionalServiceDto,
  CreateAdditionalServiceDto,
  ListAdditionalServicesDto,
  SetSlotAdditionalServicesDto,
  UpdateAdditionalServiceDto,
  UpdateClassAdditionalServiceDto,
} from './dto/additional-service.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin')
@RequiresPermission('club.fitness:view')
export class AdditionalServicesController {
  constructor(private readonly service: AdditionalServicesService) {}

  @Post('additional-services')
  @RequiresPermission('club.fitness:create')
  create(@Body() body: CreateAdditionalServiceDto) {
    return this.service.create(body);
  }

  @Get('additional-services')
  list(@Query() query: ListAdditionalServicesDto) {
    return this.service.list(query);
  }

  @Get('additional-services/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch('additional-services/:id')
  @RequiresPermission('club.fitness:update')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateAdditionalServiceDto) {
    return this.service.update(id, body);
  }

  @Patch('additional-services/:id/status')
  @RequiresPermission('club.fitness:update')
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() body: AdditionalServiceStatusDto) {
    return this.service.setStatus(id, body);
  }

  @Delete('additional-services/:id')
  @RequiresPermission('club.fitness:delete')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post('classes/:classId/additional-services')
  @RequiresPermission('club.fitness:create')
  addToClass(
    @Param('classId', ParseIntPipe) classId: number,
    @Body() body: ClassAdditionalServiceDto,
  ) {
    return this.service.addToClass(classId, body);
  }

  @Patch('classes/:classId/additional-services/:serviceId')
  @RequiresPermission('club.fitness:update')
  updateClassLink(
    @Param('classId', ParseIntPipe) classId: number,
    @Param('serviceId', ParseIntPipe) serviceId: number,
    @Body() body: UpdateClassAdditionalServiceDto,
  ) {
    return this.service.updateClassLink(classId, serviceId, body);
  }

  @Delete('classes/:classId/additional-services/:serviceId')
  @RequiresPermission('club.fitness:delete')
  removeFromClass(
    @Param('classId', ParseIntPipe) classId: number,
    @Param('serviceId', ParseIntPipe) serviceId: number,
  ) {
    return this.service.removeFromClass(classId, serviceId);
  }

  @Put('class-schedule-slots/:slotId/additional-services')
  @RequiresPermission('club.fitness:update')
  setSlotServices(
    @Param('slotId', ParseIntPipe) slotId: number,
    @Body() body: SetSlotAdditionalServicesDto,
  ) {
    return this.service.setSlotServices(slotId, body.services);
  }

  @Get('class-schedule-slots/:slotId/additional-services')
  getSlotServices(@Param('slotId', ParseIntPipe) slotId: number) {
    return this.service.getSlotServices(slotId);
  }
}
