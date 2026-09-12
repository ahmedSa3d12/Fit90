import { Module } from '@nestjs/common';
import { GymOpsModule } from '../gym-ops/gym-ops.module';
import { ClubAttendanceController } from './club-attendance.controller';
import { ClubAttendanceService } from './club-attendance.service';
import { ClubMembersController } from './club-members.controller';
import { ClubMembersService } from './club-members.service';
import { ClubMembershipTypesController } from './club-membership-types.controller';
import { ClubMembershipTypesService } from './club-membership-types.service';
import { AdmsAttendanceController } from './adms-attendance.controller';
import { AdmsAttendanceService } from './adms-attendance.service';

@Module({
  imports: [GymOpsModule],
  controllers: [ClubMembersController, ClubMembershipTypesController, ClubAttendanceController, AdmsAttendanceController],
  providers: [ClubMembersService, ClubMembershipTypesService, ClubAttendanceService, AdmsAttendanceService],
  exports: [ClubMembersService],
})
export class ClubMembersModule {}
