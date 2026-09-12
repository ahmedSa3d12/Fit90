import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '../auth/auth.module';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { MobileAppContentController } from './mobile-app-content.controller';
import { MobileAppContentService } from './mobile-app-content.service';
import { CustomerJwtGuard } from './customer-jwt.guard';
import { CustomerJwtStrategy } from './customer-jwt.strategy';
import { UploadsModule } from '../uploads/uploads.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { MobileClassBookingsController } from './mobile-class-bookings.controller';
import { MobileAppointmentsController } from './mobile-appointments.controller';
import { MobileAppointmentsService } from './mobile-appointments.service';
import { MobileNutritionAppointmentsController } from './mobile-nutrition-appointments.controller';
import { MobileNutritionAppointmentsService } from './mobile-nutrition-appointments.service';
import { MobileProviderAppointmentsService } from './mobile-provider-appointments.service';
import {
  MobilePersonalTrainingAppointmentsController,
  MobileSpaAppointmentsController,
} from './mobile-dedicated-appointments.controller';

@Module({
  imports: [AuthModule, JwtModule.register({}), UploadsModule, SchedulingModule],
  controllers: [
    MobileController,
    MobileAppContentController,
    MobileClassBookingsController,
    MobileAppointmentsController,
    MobileNutritionAppointmentsController,
    MobileSpaAppointmentsController,
    MobilePersonalTrainingAppointmentsController,
  ],
  providers: [MobileService, MobileAppContentService, MobileAppointmentsService, MobileNutritionAppointmentsService, MobileProviderAppointmentsService, CustomerJwtStrategy, CustomerJwtGuard],
  exports: [MobileService],
})
export class MobileModule {}
