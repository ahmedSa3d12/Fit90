/** Generated from frontend/src/lib/mos-menu.ts — run `npm run rbac:sync-menu` after menu changes. */
export interface MosMenuSnapshotItem {
  key: string;
  icon?: string;
  path?: string;
  children?: MosMenuSnapshotItem[];
}

export const MOS_MENU_SNAPSHOT: MosMenuSnapshotItem[] = [
  {
    key: 'dashboard',
    icon: 'dashboard',
    path: '/dashboard',
  },
  {
    key: 'membershipManagement',
    icon: 'people',
    children: [
      {
        key: 'reception',
        path: '/club/reception',
      },
      {
        key: 'membersData',
        path: '/club/members',
      },
      {
        key: 'onePassService',
        path: '/mos/sessions',
      },
      {
        key: 'memberships',
        path: '/club/subscriptions',
      },
      {
        key: 'subscriptionTypes',
        path: '/club/subscriptions/settings',
      },
      {
        key: 'memAtten',
        path: '/club/members/attendance',
      },
      {
        key: 'memberNotifications',
        path: '/mos/management/member-notifications',
      },
      {
        key: 'receipts',
        path: '/mos/receipts',
      },
    ],
  },
  {
    key: 'extra',
    icon: 'settings',
    children: [
      {
        key: 'potMembers',
        path: '/mos/potential-members',
      },
      {
        key: 'calls',
        path: '/mos/calls',
      },
      {
        key: 'customerMessaging',
        path: '/mos/customer-messaging',
      },
      {
        key: 'approveDecline',
        path: '/mos/approve-decline',
      },
      {
        key: 'requests',
        path: '/mos/requests',
      },
      {
        key: 'lostItems',
        path: '/club/lost-found',
      },
      {
        key: 'tasks',
        path: '/mos/tasks',
      },
      {
        key: 'freePrivateTraining',
        path: '/mos/free-private-training',
      },
      {
        key: 'reminders',
        path: '/mos/reminders',
      },
    ],
  },
  {
    key: 'management',
    icon: 'build',
    children: [
      {
        key: 'classes_types',
        path: '/mos/management/classes-types',
      },
      {
        key: 'class_services',
        path: '/mos/management/class-services',
      },
      { key: 'classSchedulingHome', path: '/club/fitness/class-scheduling' },
      { key: 'classMonthlySchedules', path: '/club/fitness/class-scheduling/monthly' },
    ],
  },
  {
    key: 'nutritionManagement',
    icon: 'nutrition',
    children: [
      { key: 'nutritionServiceTypes', path: '/scheduling/services/nutrition' },
      { key: 'bookingSystemBoard', path: '/scheduling/nutrition' },
      { key: 'monthlySchedules', path: '/scheduling/nutrition?tab=schedule&view=month' },
      { key: 'inbodyMeasurements', icon: 'monitor_heart', path: '/club/fitness/inbody' },
    ],
  },
  {
    key: 'spaManagement',
    icon: 'spa',
    children: [
      { key: 'spaServiceTypes', path: '/scheduling/services/spa' },
      { key: 'bookingSystemBoard', path: '/scheduling/spa' },
      { key: 'classAdditionalServices', path: '/scheduling/spa?tab=additional-services' },
      { key: 'monthlySchedules', path: '/scheduling/spa?tab=schedule&view=month' },
    ],
  },
  {
    key: 'personalTrainingManagement',
    icon: 'personal_training',
    children: [
      { key: 'personalTrainingServiceTypes', path: '/scheduling/services/personal-training' },
      { key: 'bookingSystemBoard', path: '/scheduling/personal-training' },
      { key: 'monthlySchedules', path: '/scheduling/personal-training?tab=schedule&view=month' },
    ],
  },
  {
    key: 'accountsManagement',
    icon: 'accounts',
    children: [
      { key: 'otherRevenue', path: '/mos/accounts/other-revenue' },
      { key: 'expenses', path: '/mos/accounts/expenses' },
      { key: 'deductions', path: '/mos/accounts/deductions' },
      { key: 'advances', path: '/mos/accounts/advances' },
      { key: 'bonus', path: '/mos/accounts/bonus' },
      { key: 'salaries', path: '/mos/accounts/salaries' },
      { key: 'employeesCommissions', path: '/mos/accounts/employeesCommissions' },
      {
        key: 'salesCommission',
        children: [
          { key: 'ranges', path: '/mos/management/salesRanges' },
          { key: 'percentages', path: '/mos/management/salesPercentages' },
          { key: 'targets', path: '/mos/management/salesTargets' },
        ],
      },
      { key: 'salesSchedule', path: '/mos/sales-schedule' },
      {
        key: 'trainerCommission',
        children: [
          { key: 'ranges', path: '/mos/management/coachRanges' },
          { key: 'percentages', path: '/mos/management/coachPercentages' },
          { key: 'targets', path: '/mos/management/coachTargets' },
        ],
      },
      { key: 'instructorsClassesRates', path: '/mos/management/instructors-Classes-Prices' },
    ],
  },
  {
    key: 'dataList',
    icon: 'category',
    children: [
      {
        key: 'classes_genres',
        path: '/mos/management/class-genres',
      },
      {
        key: 'classes_programs',
        path: '/mos/management/class-programs',
      },
      {
        key: 'gym_sections',
        path: '/mos/management/gym-sections',
      },
      {
        key: 'expenses_types',
        path: '/mos/management/expenses-types',
      },
      {
        key: 'owners',
        path: '/mos/management/owners',
      },
      {
        key: 'regions',
        path: '/mos/management/regions',
      },
      {
        key: 'visa_types',
        path: '/mos/management/visa-types',
      },
      {
        key: 'job_titles',
        path: '/mos/management/job-titles',
      },
      {
        key: 'call_feedbacks',
        path: '/mos/management/call-feedbacks',
      },
      {
        key: 'class_cancellation_reasons',
        path: '/mos/management/class-cancellation-reasons',
      },
      {
        key: 'membership_cancellation_reasons',
        path: '/mos/management/membership-cancellation-reasons',
      },
      {
        key: 'interest_percentages',
        path: '/mos/management/interest-percentages',
      },
      {
        key: 'locations_inside_gym',
        path: '/mos/management/gym-locations',
      },
      {
        key: 'lost_category',
        path: '/mos/management/lost-category',
      },
      {
        key: 'machine_models',
        path: '/mos/management/machine-models',
      },
      {
        key: 'package_type',
        path: '/mos/management/package-type',
      },
      {
        key: 'member_level',
        path: '/mos/management/member-level',
      },
      {
        key: 'suit_size',
        path: '/mos/management/suit-size',
      },
      {
        key: 'member_goals',
        path: '/mos/management/member-goals',
      },
      {
        key: 'sessionTypes',
        path: '/mos/management/session-types',
      },
      {
        key: 'workout_types',
        path: '/mos/management/workout-types',
      },
      {
        key: 'maintenance_types',
        path: '/mos/management/maintenance-types',
      },
      {
        key: 'reservation_types',
        path: '/mos/management/reservation-types',
      },
    ],
  },
  {
    key: 'reports',
    icon: 'insert_drive_file',
    children: [
      {
        key: 'profit',
        path: '/mos/reports/profit',
      },
      {
        key: 'profitSummary',
        path: '/mos/reports/profitSummary',
      },
      {
        key: 'membershipsIncome',
        path: '/mos/reports/membershipsIncome',
      },
      {
        key: 'personalTrainingIncome',
        path: '/mos/reports/privateMembershipsIncome',
      },
      {
        key: 'medicalMembershipsIncome',
        path: '/mos/reports/medicalMembershipsIncome',
      },
      {
        key: 'memberships',
        path: '/mos/reports/memberships/all',
      },
      {
        key: 'personalTraining',
        path: '/mos/reports/memberships/privateMemberships',
      },
      {
        key: 'notRenewedmemberships',
        path: '/mos/reports/memberships/notRenewed',
      },
      {
        key: 'newRenewedmemberships',
        path: '/mos/reports/memberships/newRenewed',
      },
      {
        key: 'membershipsLog',
        path: '/mos/reports/memberships/log',
      },
      {
        key: 'packagesUtil',
        path: '/mos/reports/packagesUntil',
      },
      {
        key: 'daybydayprofit',
        path: '/mos/reports/daybydayprofit',
      },
      {
        key: 'birthdays',
        path: '/mos/reports/birthdays',
      },
      {
        key: 'notActiveMembers',
        path: '/mos/reports/inactiveMembers',
      },
      {
        key: 'overAttendance',
        path: '/mos/reports/overAttendance',
      },
      {
        key: 'salesCommission',
        path: '/mos/reports/salesCommission',
      },
      {
        key: 'packageCommission',
        path: '/mos/reports/customPackagesCommission',
      },
      {
        key: 'logs',
        path: '/mos/reports/logs',
      },
      {
        key: 'absentMembers',
        path: '/mos/reports/absent-members',
      },
      {
        key: 'deletedReceipts',
        path: '/mos/reports/deletedReceipts',
      },
      {
        key: 'classes',
        children: [
          {
            key: 'classesTypes',
            path: '/club/fitness/classes',
          },
          {
            key: 'heldClasses',
            path: '/mos/reports/heldClasses',
          },
          {
            key: 'classesPerInstructorType',
            path: '/mos/reports/classesPerInstructorType',
          },
          {
            key: 'classesbookingList',
            path: '/club/fitness/class-booking',
          },
          {
            key: 'cancelledClasses',
            path: '/mos/reports/cancelledClasses',
          },
          {
            key: 'membersAttendanceOnClasses',
            path: '/mos/reports/membersAttendanceOnClasses',
          },
          {
            key: 'instructorsPayroll',
            path: '/mos/reports/instructors-payroll',
          },
          {
            key: 'instructorsRating',
            path: '/mos/reports/instructors-Rating',
          },
          {
            key: 'otherEntitiesBookings',
            path: '/mos/reports/other-entities-bookings',
          },
        ],
      },
      {
        key: 'memberAttendance',
        path: '/club/members/attendance',
      },
      {
        key: 'blockedMembers',
        path: '/mos/reports/blockedMembers',
      },
      {
        key: 'members',
        path: '/mos/reports/members',
      },
      {
        key: 'lostItems',
        path: '/club/lost-found',
      },
      {
        key: 'benefitsConsumption',
        path: '/mos/reports/benefitsConsumption',
      },
      {
        key: 'freeConsumedBenefits',
        path: '/mos/reports/freeConsumedBenefits',
      },
      {
        key: 'staffPayroll',
        path: '/mos/reports/staffPayroll',
      },
      {
        key: 'membershipTransfer',
        path: '/club/subscriptions/transfers',
      },
      {
        key: 'membershipUpgrade',
        path: '/mos/reports/membershipUpgrade',
      },
      {
        key: 'topActiveMembers',
        path: '/mos/reports/topActiveMembers',
      },
      {
        key: 'membershipsDiscount',
        path: '/mos/reports/membershipsDiscount',
      },
      {
        key: 'gymAttendanceCount',
        path: '/mos/reports/gymAttendanceCount',
      },
      {
        key: 'maximumExpirationDate',
        path: '/mos/reports/maximumExpirationDate',
      },
      {
        key: 'packageUtilizationPerSalesPersonal',
        path: '/mos/reports/packageUtilizationPerSalesPersonal',
      },
      {
        key: 'trainersReports',
        children: [
          {
            key: 'consumedPTSessions',
            path: '/mos/reports/consumedPTSessions',
          },
          {
            key: 'trainerClosingRatio',
            path: '/mos/reports/trainerClosingRatio',
          },
          {
            key: 'trainerClosingRatioDetails',
            path: '/mos/reports/trainerClosingRatioDetails',
          },
          {
            key: 'trainerCommission',
            path: '/mos/reports/trainerCommission',
          },
          {
            key: 'trainersAchievement',
            path: '/mos/reports/trainersAchievement',
          },
          {
            key: 'fixedTrainerCommission',
            path: '/mos/reports/fixedTrainerCommission',
          },
          {
            key: 'trainerMemberRetention',
            path: '/mos/reports/trainer-member-retention',
          },
          {
            key: 'consumedPTSessionsPerMembership',
            path: '/mos/reports/consumedPTSessionsPerMembership',
          },
          {
            key: 'consumedPTSessionsPerTrainer',
            path: '/mos/reports/consumedPTSessionsPerTrainer',
          },
          {
            key: 'freePrivateTraining',
            path: '/mos/reports/freePrivateTraining',
          },
        ],
      },
      {
        key: 'salesPersonClosingRatio',
        path: '/mos/reports/salesPersonClosingRatio',
      },
      {
        key: 'salesPersonClosingRatioDetails',
        path: '/mos/reports/salesPersonClosingRatioDetails',
      },
      {
        key: 'expenses',
        path: '/mos/reports/expenses',
      },
      {
        key: 'employeeFinancial',
        path: '/mos/reports/employeeFinancial',
      },
      {
        key: 'multipleAttendancePerDay',
        path: '/mos/reports/multipleAttendancePerDay',
      },
      {
        key: 'membershipsIncomePerPackageType',
        path: '/mos/reports/membershipsIncomePerPackageType',
      },
    ],
  },
  {
    key: 'appManagement',
    icon: 'smartphone',
    children: [
      { key: 'announcements', path: '/app/ads' },
      { key: 'complaintsAndSuggestions', path: '/app/complaints' },
      { key: 'offers', path: '/app/offers' },
      { key: 'notificationsTemplates', path: '/mos/management/notifications-Templates' },
      { key: 'invitations', path: '/app/invitations' },
      { key: 'feedbacks', path: '/app/feedbacks' },
      { key: 'faqs', path: '/mos/management/faqs' },
      { key: 'exercises', path: '/mos/management/exercises' },
      { key: 'gymRules', path: '/mos/management/gym-rules' },
      { key: 'aboutApp', path: '/app/about' },
    ],
  },
  {
    key: 'staff',
    icon: 'assignment_ind',
    children: [
      {
        key: 'staffData',
        path: '/employees',
      },
      {
        key: 'trainers',
        path: '/club/fitness/trainers?kind=private',
      },
      {
        key: 'instructors',
        path: '/club/fitness/trainers?kind=instructor',
      },
      {
        key: 'staffAttendance',
        path: '/attendance',
      },
      {
        key: 'shifts',
        path: '/mos/shifts',
      },
      {
        key: 'employeesRequests',
        path: '/mos/employees-requests',
      },
    ],
  },
  {
    key: 'settingsManagement',
    icon: 'settings',
    children: [
      { key: 'employeeBranches', path: '/org/branches' },
      { key: 'employeeJobTitles', path: '/org/job-titles' },
      { key: 'gymPolicies', path: '/settings/gym-policies' },
      { key: 'customerSourcesSettings', path: '/settings/customer-sources' },
      { key: 'employeeNationalities', path: '/settings/nationalities' },
      { key: 'employeeReligions', path: '/settings/religions' },
      { key: 'employeeSocialStatuses', path: '/settings/social-statuses' },
    ],
  },
  {
    key: 'userManagement',
    icon: 'manage_accounts',
    children: [
      { key: 'roles', path: '/admin/roles' },
      { key: 'permissions', path: '/admin/exceptions' },
      { key: 'users', path: '/users' },
      { key: 'employeeAudit', path: '/admin/audit' },
    ],
  },
  {
    key: 'additionalManagement',
    icon: 'settings',
    children: [
      { key: 'benefits', path: '/club/fitness/spa-services' },
      { key: 'doctorsSchedule', path: '/club/fitness/inbody-bookings' },
      {
        key: 'requiredFields',
        children: [
          { key: 'requiredFieldsMemberProfile', path: '/club/subscriptions/member-form' },
          { key: 'potMembers', path: '/mos/management/possible-members-fields' },
        ],
      },
      { key: 'machines', path: '/mos/management/machines' },
      { key: 'packagesCommissionsMonths', path: '/mos/management/packages-commissions' },
      { key: 'closingTransactions', path: '/mos/management/closing-Transactions' },
    ],
  },
  {
    key: 'about',
    icon: 'help_outline',
    path: '/mos/public/about',
  },
  {
    key: 'companyData',
    icon: 'business',
    path: '/company',
  },
];

// Collect the accounting and lookup-data sections before removing "Additional"
// so its former children do not leak back into the RBAC catalog as roots.
const additionalMenu = MOS_MENU_SNAPSHOT.find((item) => item.key === 'additionalManagement');
const additionalNestedKeys = ['accountsManagement', 'dataList'];
const additionalNestedMenus = additionalNestedKeys
  .map((key) => MOS_MENU_SNAPSHOT.find((item) => item.key === key))
  .filter((item): item is MosMenuSnapshotItem => Boolean(item));

for (const menu of additionalNestedMenus) {
  const index = MOS_MENU_SNAPSHOT.indexOf(menu);
  if (index !== -1) MOS_MENU_SNAPSHOT.splice(index, 1);
}

if (additionalMenu?.children) {
  additionalMenu.children.unshift(...additionalNestedMenus);
  const additionalIndex = MOS_MENU_SNAPSHOT.indexOf(additionalMenu);
  if (additionalIndex !== -1) MOS_MENU_SNAPSHOT.splice(additionalIndex, 1);
}

// Keep reports directly after personal training in the top-level sidebar.
const reportsIndex = MOS_MENU_SNAPSHOT.findIndex((item) => item.key === 'reports');
const personalTrainingIndex = MOS_MENU_SNAPSHOT.findIndex(
  (item) => item.key === 'personalTrainingManagement',
);

if (reportsIndex !== -1 && personalTrainingIndex !== -1) {
  const [reportsMenu] = MOS_MENU_SNAPSHOT.splice(reportsIndex, 1);
  const updatedPersonalTrainingIndex = MOS_MENU_SNAPSHOT.findIndex(
    (item) => item.key === 'personalTrainingManagement',
  );
  MOS_MENU_SNAPSHOT.splice(updatedPersonalTrainingIndex + 1, 0, reportsMenu);
}

// The administrative sections must follow reports in this exact order.
const administrationOrder = [
  'appManagement',
  'staff',
  'settingsManagement',
  'userManagement',
];
const administrationMenus = administrationOrder
  .map((key) => MOS_MENU_SNAPSHOT.find((item) => item.key === key))
  .filter((item): item is MosMenuSnapshotItem => Boolean(item));

for (const menu of administrationMenus) {
  const index = MOS_MENU_SNAPSHOT.indexOf(menu);
  if (index !== -1) MOS_MENU_SNAPSHOT.splice(index, 1);
}

const updatedReportsIndex = MOS_MENU_SNAPSHOT.findIndex((item) => item.key === 'reports');
if (updatedReportsIndex !== -1) {
  MOS_MENU_SNAPSHOT.splice(updatedReportsIndex + 1, 0, ...administrationMenus);
}
