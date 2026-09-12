/** MOS route resolution — path suffix after /mos/ → page kind + config */

import { MOS_MENU, type MosMenuItem } from '@/lib/mos-menu';

export type MosPageKind =
  | 'entity'
  | 'lookup'
  | 'report'
  | 'receipts'
  | 'debts'
  | 'tasks'
  | 'about'
  | 'schedule'
  | 'commission'
  | 'closing'
  | 'leads'
  | 'approvals'
  | 'class-services'
  | 'free-private-training'
  | 'customer-messaging';

export interface MosEntityRouteConfig {
  kind: 'entity';
  entityKey: string;
  titleKey: string;
  fields: MosFieldDef[];
  statKeys?: string[];
}

export interface MosLookupRouteConfig {
  kind: 'lookup';
  category: string;
  titleKey: string;
  nameOnly?: boolean;
  nameLabelKey?: string;
  hasPrice?: boolean;
}

export interface MosReportRouteConfig {
  kind: 'report';
  reportKey: string;
  titleKey: string;
}

export interface MosCommissionRouteConfig {
  kind: 'commission';
  titleKey: string;
  defaultKind?: string;
  rulesFocus?: boolean;
}

export interface MosSimpleRouteConfig {
  kind: Exclude<MosPageKind, 'entity' | 'lookup' | 'report' | 'commission'>;
  titleKey: string;
}

export type MosRouteConfig =
  | MosEntityRouteConfig
  | MosLookupRouteConfig
  | MosReportRouteConfig
  | MosCommissionRouteConfig
  | MosSimpleRouteConfig;

export interface MosFieldDef {
  key: string;
  labelKey?: string;
  type?: 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'json' | 'image' | 'file';
  required?: boolean;
  options?: { value: string; label: string }[];
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'completed', label: 'Completed' },
  { value: 'closed', label: 'Closed' },
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
];

function entity(
  entityKey: string,
  titleKey: string,
  fields: MosFieldDef[],
): MosEntityRouteConfig {
  return { kind: 'entity', entityKey, titleKey, fields };
}

export const MOS_ROUTE_MAP: Record<string, MosRouteConfig> = {
  ads: entity('announcements', 'announcements', [
    { key: 'title', required: true },
    { key: 'body', type: 'textarea' },
    { key: 'imageUrl', type: 'image' },
  ]),
  offers: entity('offers', 'offers', [
    { key: 'title', required: true },
    { key: 'body', type: 'textarea' },
    { key: 'imageUrl', type: 'image' },
  ]),
  'potential-members': { kind: 'leads', titleKey: 'potMembers' },
  calls: entity('calls', 'calls', [
    { key: 'memberName' },
    { key: 'phone' },
    { key: 'callDate', type: 'date', required: true },
    { key: 'callTime', type: 'time' },
    { key: 'subject' },
    { key: 'outcome' },
    { key: 'staffName' },
    { key: 'notes', type: 'textarea' },
  ]),
  invitations: entity('invitations', 'invitations', [
    { key: 'inviteeName', required: true },
    { key: 'inviteePhone' },
    { key: 'inviteeGender' },
    { key: 'invitedByName' },
    { key: 'visitDate', type: 'date' },
    { key: 'status', type: 'select', options: STATUS_OPTIONS },
    { key: 'notes', type: 'textarea' },
  ]),
  complaints: entity('complaints', 'complaintsAndSuggestions', [
    { key: 'memberName' },
    { key: 'subject', required: true },
    { key: 'body', type: 'textarea' },
    { key: 'status', type: 'select', options: STATUS_OPTIONS },
    { key: 'priority' },
    { key: 'staffName' },
  ]),
  requests: entity('requests', 'requests', [
    { key: 'memberName' },
    { key: 'subject', required: true },
    { key: 'body', type: 'textarea' },
    { key: 'status', type: 'select', options: STATUS_OPTIONS },
  ]),
  feedbacks: entity('feedbacks', 'feedbacks', [
    { key: 'memberName' },
    { key: 'subject', required: true },
    { key: 'body', type: 'textarea' },
    { key: 'status', type: 'select', options: STATUS_OPTIONS },
  ]),
  'approve-decline': { kind: 'approvals', titleKey: 'approveDecline' },
  'machine-maintenance': entity('machine-maintenance', 'machineMaintenance', [
    { key: 'machineName' },
    { key: 'maintenanceDate', type: 'date', required: true },
    { key: 'maintenanceType' },
    { key: 'cost', type: 'number' },
    { key: 'status', type: 'select', options: STATUS_OPTIONS },
    { key: 'notes', type: 'textarea' },
  ]),
  workouts: entity('workouts', 'workouts', [
    { key: 'title', required: true },
    { key: 'workoutType' },
    { key: 'trainerName' },
    { key: 'memberName' },
    { key: 'workoutDate', type: 'date' },
    { key: 'notes', type: 'textarea' },
  ]),
  reminders: entity('reminders', 'reminders', [
    { key: 'memberName' },
    { key: 'title', required: true },
    { key: 'reminderDate', type: 'date', required: true },
    { key: 'reminderTime', type: 'time' },
    { key: 'channel' },
    { key: 'status', type: 'select', options: STATUS_OPTIONS },
    { key: 'notes', type: 'textarea' },
  ]),
  'branch-visit': entity('branch-visit', 'branchesVisits', [
    { key: 'memberName' },
    { key: 'visitDate', type: 'date', required: true },
    { key: 'visitTime', type: 'time' },
    { key: 'notes', type: 'textarea' },
  ]),
  sessions: entity('sessions', 'onePassService', [
    { key: 'memberName' },
    { key: 'sessionDate', type: 'date', required: true },
    { key: 'serviceName' },
    { key: 'amount', type: 'number' },
    { key: 'status', type: 'select', options: STATUS_OPTIONS },
    { key: 'notes', type: 'textarea' },
  ]),
  'class-rooms': entity('class-rooms', 'class_rooms', [
    { key: 'name', required: true },
    { key: 'code' },
    { key: 'capacity', type: 'number' },
  ]),
  shifts: entity('shifts', 'shifts', [
    { key: 'name', required: true },
    { key: 'startTime', type: 'time', required: true },
    { key: 'endTime', type: 'time', required: true },
  ]),
  'employees-requests': entity('employees-requests', 'employeesRequests', [
    { key: 'employeeName', required: true },
    { key: 'requestType', required: true },
    { key: 'subject', required: true },
    { key: 'body', type: 'textarea' },
    { key: 'status', type: 'select', options: STATUS_OPTIONS },
  ]),
  'management/machines': entity('machines', 'machines', [
    { key: 'name', required: true },
    { key: 'serialNumber' },
    { key: 'modelName' },
    { key: 'status', type: 'select', options: STATUS_OPTIONS },
  ]),
  'management/closing-Transactions': { kind: 'closing', titleKey: 'closingTransactions' },
  'accounts/other-revenue': entity('other-revenue', 'otherRevenue', [
    { key: 'title', required: true },
    { key: 'amount', type: 'number', required: true },
    { key: 'entryDate', type: 'date', required: true },
    { key: 'employeeName' },
    { key: 'paymentMethod' },
    { key: 'notes', type: 'textarea' },
  ]),
  'accounts/expenses': entity('expenses', 'expenses', [
    { key: 'title', required: true },
    { key: 'amount', type: 'number', required: true },
    { key: 'entryDate', type: 'date', required: true },
    { key: 'employeeName' },
    { key: 'notes', type: 'textarea' },
  ]),
  'accounts/deductions': entity('deductions', 'deductions', [
    { key: 'title', required: true },
    { key: 'amount', type: 'number', required: true },
    { key: 'entryDate', type: 'date', required: true },
    { key: 'employeeName' },
  ]),
  'accounts/advances': entity('advances', 'advances', [
    { key: 'title', required: true },
    { key: 'amount', type: 'number', required: true },
    { key: 'entryDate', type: 'date', required: true },
    { key: 'employeeName' },
  ]),
  'accounts/bonus': entity('bonus', 'bonus', [
    { key: 'title', required: true },
    { key: 'amount', type: 'number', required: true },
    { key: 'entryDate', type: 'date', required: true },
    { key: 'employeeName' },
  ]),
  'accounts/salaries': entity('salaries', 'salaries', [
    { key: 'title', required: true },
    { key: 'amount', type: 'number', required: true },
    { key: 'entryDate', type: 'date', required: true },
    { key: 'employeeName' },
  ]),
  'accounts/employeesCommissions': { kind: 'commission', titleKey: 'employeesCommissions' },
  'management/announcements': entity('announcements', 'announcements', [
    { key: 'title', required: true },
    { key: 'body', type: 'textarea' },
    { key: 'imageUrl', type: 'image' },
  ]),
  'management/faqs': entity('faqs', 'faqs', [
    { key: 'title', required: true },
    { key: 'body', type: 'textarea' },
  ]),
  'management/exercises': entity('exercises', 'exercises', [
    { key: 'title', required: true },
    { key: 'body', type: 'textarea' },
    { key: 'imageUrl', type: 'image' },
  ]),
  'management/gym-rules': entity('gym-rules', 'gymRules', [
    { key: 'title', required: true },
    { key: 'body', type: 'textarea' },
  ]),
  about: entity('about-app', 'aboutApp', [
    { key: 'title', labelKey: 'mos.title', required: true },
    { key: 'body', labelKey: 'mos.body', type: 'textarea', required: true },
    { key: 'imageUrl', labelKey: 'mos.imageOrFile', type: 'file' },
  ]),
  'administration/gym-images': entity('gym-images', 'gymImages', [
    { key: 'title', required: true },
    { key: 'imageUrl', type: 'image', required: true },
  ]),
  'administration/classes-schedule-images': entity('classes-schedule-images', 'classesScheduleImages', [
    { key: 'title', required: true },
    { key: 'imageUrl', type: 'image', required: true },
  ]),
  'administration/trans-images': entity('trans-images', 'transformationImages', [
    { key: 'title', required: true },
    { key: 'imageUrl', type: 'image', required: true },
  ]),
  'management/appHomeScreenSections': entity('app-home-sections', 'appHomeScreenSections', [
    { key: 'title', required: true },
    { key: 'body', type: 'textarea' },
    { key: 'imageUrl', type: 'image' },
  ]),
  'management/member-notifications': entity('member-notifications', 'memberNotifications', [
    { key: 'title', required: true },
    { key: 'body', type: 'textarea' },
  ]),
  'management/possible-members-fields': entity('possible-members-fields', 'potMembers', [
    { key: 'title', required: true },
    { key: 'body', type: 'textarea' },
  ]),
  'management/notifications-Templates': entity('notifications-templates', 'notificationsTemplates', [
    { key: 'title', required: true },
    { key: 'body', type: 'textarea' },
  ]),
  'management/salesRanges': { kind: 'commission', titleKey: 'ranges', defaultKind: 'sales_range', rulesFocus: true },
  'management/salesPercentages': { kind: 'commission', titleKey: 'percentages', defaultKind: 'sales_percentage', rulesFocus: true },
  'management/salesTargets': { kind: 'commission', titleKey: 'targets', defaultKind: 'sales_target', rulesFocus: true },
  'management/coachRanges': { kind: 'commission', titleKey: 'ranges', defaultKind: 'trainer_range', rulesFocus: true },
  'management/coachPercentages': { kind: 'commission', titleKey: 'percentages', defaultKind: 'trainer_percentage', rulesFocus: true },
  'management/coachTargets': { kind: 'commission', titleKey: 'targets', defaultKind: 'trainer_target', rulesFocus: true },
  'management/instructors-Classes-Prices': { kind: 'commission', titleKey: 'instructorsClassesRates', defaultKind: 'instructor_class_rate', rulesFocus: true },
  'management/packages-commissions': { kind: 'commission', titleKey: 'packagesCommissionsMonths', defaultKind: 'package_commission', rulesFocus: true },

  // Lookups
  'management/class-genres': { kind: 'lookup', category: 'class_genre', titleKey: 'classes_genres' },
  'management/class-programs': { kind: 'lookup', category: 'class_program', titleKey: 'classes_programs' },
  'management/classes-types': {
    kind: 'lookup',
    category: 'class_type',
    titleKey: 'classes_types',
    nameOnly: true,
    nameLabelKey: 'nav.mos.className',
    hasPrice: true,
  },
  'management/class-services': { kind: 'class-services', titleKey: 'class_services' },
  'management/gym-sections': { kind: 'lookup', category: 'gym_section', titleKey: 'gym_sections' },
  'management/expenses-types': { kind: 'lookup', category: 'expense_type', titleKey: 'expenses_types' },
  'management/owners': { kind: 'lookup', category: 'owner', titleKey: 'owners' },
  'management/nationalities': { kind: 'lookup', category: 'nationality', titleKey: 'nationalities' },
  'management/regions': { kind: 'lookup', category: 'region', titleKey: 'regions' },
  'management/visa-types': { kind: 'lookup', category: 'visa_type', titleKey: 'visa_types' },
  'management/job-titles': { kind: 'lookup', category: 'job_title', titleKey: 'job_titles' },
  'management/call-feedbacks': { kind: 'lookup', category: 'call_feedback', titleKey: 'call_feedbacks' },
  'management/class-cancellation-reasons': { kind: 'lookup', category: 'class_cancel_reason', titleKey: 'class_cancellation_reasons' },
  'management/membership-cancellation-reasons': { kind: 'lookup', category: 'membership_cancel_reason', titleKey: 'membership_cancellation_reasons' },
  'management/interest-percentages': { kind: 'lookup', category: 'interest_percentage', titleKey: 'interest_percentages' },
  'management/gym-locations': { kind: 'lookup', category: 'gym_location', titleKey: 'locations_inside_gym' },
  'management/lost-category': { kind: 'lookup', category: 'lost_category', titleKey: 'lost_category' },
  'management/machine-models': { kind: 'lookup', category: 'machine_model', titleKey: 'machine_models' },
  'management/package-type': { kind: 'lookup', category: 'package_type', titleKey: 'package_type' },
  'management/member-level': { kind: 'lookup', category: 'member_level', titleKey: 'member_level' },
  'management/suit-size': { kind: 'lookup', category: 'suit_size', titleKey: 'suit_size' },
  'management/member-goals': { kind: 'lookup', category: 'member_goal', titleKey: 'member_goals' },
  'management/session-types': { kind: 'lookup', category: 'session_type', titleKey: 'sessionTypes' },
  'management/workout-types': { kind: 'lookup', category: 'workout_type', titleKey: 'workout_types' },
  'management/maintenance-types': { kind: 'lookup', category: 'maintenance_type', titleKey: 'maintenance_types' },
  'management/reservation-types': { kind: 'lookup', category: 'reservation_type', titleKey: 'reservation_types' },

  // Special pages
  receipts: { kind: 'receipts', titleKey: 'receipts' },
  debts: { kind: 'debts', titleKey: 'debts' },
  tasks: { kind: 'tasks', titleKey: 'tasks' },
  'sales-schedule': { kind: 'schedule', titleKey: 'salesSchedule' },
  'public/about': { kind: 'about', titleKey: 'about' },
  'free-private-training': { kind: 'free-private-training', titleKey: 'freePrivateTraining' },
  'customer-messaging': { kind: 'customer-messaging', titleKey: 'customerMessaging' },
};

/** Report paths: /mos/reports/{key} or nested */
export function reportKeyFromPath(path: string): string | null {
  const m = path.match(/^\/mos\/reports\/(.+)$/);
  if (!m) return null;
  const segments = m[1].split('/');
  if (segments[0] === 'memberships') {
    return segments.slice(1).join('/') || 'memberships';
  }
  return m[1].replace(/\//g, '');
}

function menuTitleKeyForPath(path: string, items: MosMenuItem[] = MOS_MENU): string | null {
  for (const item of items) {
    if (item.path === path) return item.key;
    if (item.children) {
      const childKey = menuTitleKeyForPath(path, item.children);
      if (childKey) return childKey;
    }
  }
  return null;
}

export function resolveMosRoute(
  pathname: string,
): MosRouteConfig | { kind: 'report'; reportKey: string; titleKey: string } | null {
  const suffix = pathname.replace(/^\/(?:mos|app)\/?/, '').replace(/\/$/, '');
  if (!suffix) return null;

  const reportKey = reportKeyFromPath(pathname);
  if (reportKey) {
    return {
      kind: 'report',
      reportKey,
      titleKey: menuTitleKeyForPath(pathname) ?? reportKey,
    };
  }

  return MOS_ROUTE_MAP[suffix] ?? null;
}
