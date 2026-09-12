import { Global, Module } from '@nestjs/common';
import { EmployeeDataScopeService } from './employee-data-scope.service';
import { EmployeeRecordScopeGuard } from './employee-record-scope.guard';

@Global()
@Module({
  providers: [EmployeeDataScopeService, EmployeeRecordScopeGuard],
  exports: [EmployeeDataScopeService, EmployeeRecordScopeGuard],
})
export class EmployeeScopeModule {}
