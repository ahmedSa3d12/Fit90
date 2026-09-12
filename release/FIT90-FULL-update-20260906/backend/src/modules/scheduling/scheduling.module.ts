import { Module } from '@nestjs/common';
// Legacy (kept for backward compatibility with existing club-fitness pages).
import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';
import { InbodyBookingsController } from './inbody-bookings.controller';
import { InbodyBookingsService } from './inbody-bookings.service';
// Generic scheduling engine.
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { NutritionBookingsService } from './nutrition-bookings.service';
import { InbodyRecordsController } from './inbody-records.controller';
import { InbodyRecordsService } from './inbody-records.service';
import { SchedulingDashboardController } from './scheduling-dashboard.controller';
import { SchedulingDashboardService } from './scheduling-dashboard.service';
import { SchedulingNotificationsController } from './scheduling-notifications.controller';
import { SchedulingNotificationsService } from './scheduling-notifications.service';
import { SchedulingCron } from './scheduling.cron';
import { ClassSchedulesController } from './class-schedules.controller';
import { ClassSchedulesService } from './class-schedules.service';
import { AdditionalServicesController } from './additional-services.controller';
import { AdditionalServicesService } from './additional-services.service';
import { ClassBookingsController } from './class-bookings.controller';
import { ClassBookingsService } from './class-bookings.service';
import { AdminClassBookingsController } from './admin-class-bookings.controller';
import { ServiceMonthlySchedulesController } from './service-monthly-schedules.controller';
import { ServiceMonthlySchedulesService } from './service-monthly-schedules.service';
import { ProviderMonthlyAvailabilityController } from './provider-monthly-availability.controller';
import { ProviderMonthlyAvailabilityService } from './provider-monthly-availability.service';
import { SpaAdditionalServicesController } from './spa-additional-services.controller';
import { SpaAdditionalServicesService } from './spa-additional-services.service';

/**
 * Scheduling & Booking — the single scheduling engine.
 *
 *   club_services  (catalog)
 *     └── club_schedules  (slots; recurring/bulk generation + conflict checks)
 *           └── club_bookings  (capacity-managed bookings + notifications)
 *   club_inbody_records   (independent InBody results + per-member history)
 *
 * Rooms reuse club_class_rooms, machines reuse club_machines, providers reuse
 * club_trainers. The legacy Availability/InbodyBookings controllers remain wired
 * so existing pages keep working during migration.
 */
@Module({
  controllers: [
    ServicesController,
    SchedulesController,
    BookingsController,
    InbodyRecordsController,
    SchedulingDashboardController,
    SchedulingNotificationsController,
    ClassSchedulesController,
    AdditionalServicesController,
    ClassBookingsController,
    AdminClassBookingsController,
    ServiceMonthlySchedulesController,
    ProviderMonthlyAvailabilityController,
    SpaAdditionalServicesController,
    // legacy
    AvailabilityController,
    InbodyBookingsController,
  ],
  providers: [
    ServicesService,
    SchedulesService,
    BookingsService,
    NutritionBookingsService,
    InbodyRecordsService,
    SchedulingDashboardService,
    SchedulingNotificationsService,
    SchedulingCron,
    ClassSchedulesService,
    AdditionalServicesService,
    ClassBookingsService,
    ServiceMonthlySchedulesService,
    ProviderMonthlyAvailabilityService,
    SpaAdditionalServicesService,
    // legacy
    AvailabilityService,
    InbodyBookingsService,
  ],
  exports: [
    ServicesService,
    SchedulesService,
    BookingsService,
    NutritionBookingsService,
    InbodyRecordsService,
    AvailabilityService,
    InbodyBookingsService,
    ClassBookingsService,
  ],
})
export class SchedulingModule {}
