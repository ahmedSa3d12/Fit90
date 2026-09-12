import { Module } from '@nestjs/common';
import { ClubSalesStaffController } from './club-sales-staff.controller';
import { ClubSalesStaffService } from './club-sales-staff.service';

@Module({
  controllers: [ClubSalesStaffController],
  providers: [ClubSalesStaffService],
  exports: [ClubSalesStaffService],
})
export class ClubSalesStaffModule {}
