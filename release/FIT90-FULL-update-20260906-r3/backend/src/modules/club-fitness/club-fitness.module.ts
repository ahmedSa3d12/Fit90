import { Module } from '@nestjs/common';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { ClubClassesController } from './club-classes.controller';
import { ClubClassesService } from './club-classes.service';
import { ClubFitnessLedgerService } from './club-fitness-ledger.service';
import { ClubTrainersController } from './club-trainers.controller';
import { ClubTrainersService } from './club-trainers.service';
import {
  ClubInbodyInvoicesController,
  ClubInbodyMeasurementsController,
  ClubSpaBookingsController,
  ClubSpaInvoicesController,
  ClubSpaServicesController,
} from './club-wellness.controller';
import { ClubWellnessService } from './club-wellness.service';
import { WhatsappCloudService } from './whatsapp-cloud.service';
import { WhatsappMessagingController } from './whatsapp-messaging.controller';

@Module({
  imports: [GymOpsModule],
  controllers: [
    ClubTrainersController,
    ClubClassesController,
    ClubInbodyMeasurementsController,
    ClubInbodyInvoicesController,
    ClubSpaServicesController,
    ClubSpaBookingsController,
    ClubSpaInvoicesController,
    WhatsappMessagingController,
  ],
  providers: [
    ClubTrainersService,
    ClubClassesService,
    ClubWellnessService,
    ClubFitnessLedgerService,
    WhatsappCloudService,
  ],
  exports: [ClubTrainersService, ClubClassesService],
})
export class ClubFitnessModule {}
