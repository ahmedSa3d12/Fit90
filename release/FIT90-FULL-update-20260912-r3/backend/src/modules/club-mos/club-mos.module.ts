import { Module } from '@nestjs/common';
import { MosEntitiesController } from './mos-entities.controller';
import { MosEntityService } from './mos-entity.service';
import { MosLookupsController } from './mos-lookups.controller';
import { MosLookupsService } from './mos-lookups.service';
import { MosReportsController } from './mos-reports.controller';
import { MosReportsService } from './mos-reports.service';
import { ClubCommissionController } from './mos-commission.controller';
import { ClubCommissionService } from './mos-commission.service';
import { ClubClosingController } from './mos-closing.controller';
import { ClubClosingService } from './mos-closing.service';
import { MosDashboardController } from './mos-dashboard.controller';
import { MosDashboardService } from './mos-dashboard.service';
import { MosFreePrivateTrainingController } from './mos-free-private-training.controller';
import { MosFreePrivateTrainingService } from './mos-free-private-training.service';
import { ClubMembersModule } from '../club-members/club-members.module';
import { MosEntityPermissionsGuard } from './mos-entity-permissions.guard';

@Module({
  imports: [ClubMembersModule],
  controllers: [
    MosEntitiesController,
    MosLookupsController,
    MosReportsController,
    ClubCommissionController,
    ClubClosingController,
    MosDashboardController,
    MosFreePrivateTrainingController,
  ],
  providers: [
    MosEntityService,
    MosEntityPermissionsGuard,
    MosLookupsService,
    MosReportsService,
    ClubCommissionService,
    ClubClosingService,
    MosDashboardService,
    MosFreePrivateTrainingService,
  ],
  exports: [MosEntityService, MosReportsService, ClubCommissionService, ClubClosingService, MosDashboardService],
})
export class ClubMosModule {}
