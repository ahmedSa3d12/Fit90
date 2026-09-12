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
import { ClubSubscriptionsService } from './club-subscriptions.service';
import { ListClubSubscriptionsDto } from './dto/list-club-subscriptions.dto';
import { UpsertClubSubscriptionDto } from './dto/upsert-club-subscription.dto';

@UseGuards(JwtAuthGuard)
@Controller('club-subscriptions')
@RequiresPermission('club.subscriptions:view')
export class ClubSubscriptionsController {
  constructor(private readonly service: ClubSubscriptionsService) {}

  @Get()
  list(@Query() query: ListClubSubscriptionsDto, @CurrentUser() user: JwtUser) {
    return this.service.list(query, user);
  }

  @Get('statistics')
  statistics(@CurrentUser() user: JwtUser, @Query('isSpecial') isSpecial?: string) {
    return this.service.statistics(isSpecial, user);
  }

  @Get('outstanding-report')
  outstandingReport(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('branch') branch?: string,
    @Query('search') search?: string,
    @Query('dateField') dateField?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.outstandingReport({ dateFrom, dateTo, branch, search, dateField }, user);
  }

  @Get('expired-report')
  expiredReport(
    @Query('branch') branch?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.expiredReport({ branch, search }, user);
  }

  @Get('member-transfer-history')
  memberTransferHistory(@CurrentUser() user: JwtUser) {
    return this.service.memberTransferHistory(user);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.findOne(id, user);
  }

  @Post()
  @RequiresPermission('club.subscriptions:create')
  create(@Body() body: UpsertClubSubscriptionDto, @CurrentUser('sub') userId: number) {
    return this.service.create(body, userId);
  }

  @Put(':id')
  @RequiresPermission('club.subscriptions:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<UpsertClubSubscriptionDto>,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.update(id, body, user);
  }

  @Delete(':id')
  @RequiresPermission('club.subscriptions:delete')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.remove(id, user);
  }

  @Patch(':id/sessions')
  @RequiresPermission('club.subscriptions:update')
  sessions(
    @Param('id', ParseIntPipe) id: number,
    @Body('sessionsUsed', ParseIntPipe) sessionsUsed: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.patchSessions(id, sessionsUsed, user);
  }

  @Post(':id/sessions/use')
  @RequiresPermission('club.subscriptions:update')
  useSession(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.useSession(id, user);
  }

  @Patch(':id/payment')
  @RequiresPermission('club.subscriptions:update')
  payment(
    @Param('id', ParseIntPipe) id: number,
    @Body('paymentAmount') paymentAmount: number,
    @Body('paymentMethod') paymentMethod?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.processPayment(id, Number(paymentAmount), paymentMethod, user);
  }

  @Patch(':id/renew')
  @RequiresPermission('club.subscriptions:update')
  renew(
    @Param('id', ParseIntPipe) id: number,
    @Body('renewalDays') renewalDays?: number,
    @Body('paidAmount') paidAmount?: number,
    @Body('paymentMethod') paymentMethod?: string,
    @CurrentUser() user?: JwtUser,
  ) {
    return this.service.renew(id, renewalDays != null ? Number(renewalDays) : undefined, {
      paidAmount: paidAmount != null ? Number(paidAmount) : undefined,
      paymentMethod,
      user,
    });
  }

  @Post(':id/freeze')
  @RequiresPermission('club.subscriptions:update')
  freeze(
    @Param('id', ParseIntPipe) id: number,
    @Body('startDate') startDate: string | undefined,
    @Body('endDate') endDate: string | undefined,
    @Body('reason') reason: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.freeze(
      id,
      startDate,
      endDate,
      reason,
      user.sub,
      user,
    );
  }

  @Post(':id/unfreeze')
  @RequiresPermission('club.subscriptions:update')
  unfreeze(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.service.unfreeze(id, user.sub, user);
  }

  @Patch(':id/transfer-member')
  @RequiresPermission('club.subscriptions:update')
  transferMember(
    @Param('id', ParseIntPipe) id: number,
    @Body('memberId', ParseIntPipe) memberId: number,
    @Body('reason') reason: string | undefined,
    @CurrentUser() user: JwtUser,
  ) {
    return this.service.transferMember(id, memberId, reason, user);
  }
}
