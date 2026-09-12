import {
  Body,
  Controller,
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
import { ClubCommissionService } from './mos-commission.service';

@UseGuards(JwtAuthGuard)
@Controller('club-mos/commissions')
@RequiresPermission('mos:view', 'club.members:view')
export class ClubCommissionController {
  constructor(private readonly service: ClubCommissionService) {}

  @Get('calculate')
  calculate(
    @Query('kind') kind: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.service.calculate(
      kind,
      from ?? null,
      to ?? null,
      branchId != null && branchId !== '' ? Number(branchId) : null,
    );
  }

  @Post('payout')
  @RequiresPermission('club.members:create')
  payout(
    @Body()
    body: { kind: string; from?: string; to?: string; branchId?: number; rows?: unknown[] },
    @CurrentUser() user: JwtUser,
  ) {
    // Amounts are always recomputed server-side; client `rows` are ignored.
    return this.service.payout({
      kind: body.kind,
      from: body.from ?? null,
      to: body.to ?? null,
      branchId: body.branchId ?? null,
      closedBy: user?.name ?? null,
    });
  }

  @Get('rules')
  listRules() {
    return this.service.listRules();
  }

  @Put('rules/:id')
  @RequiresPermission('club.members:update')
  updateRule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { config?: unknown; name?: string; isActive?: boolean },
  ) {
    return this.service.updateRule(id, body);
  }
}
