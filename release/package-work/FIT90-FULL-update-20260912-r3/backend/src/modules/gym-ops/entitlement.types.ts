export type EntitlementSeverity = 'block' | 'warn';

export interface EntitlementReason {
  code: string;
  messageAr: string;
  messageEn: string;
  severity: EntitlementSeverity;
}

export interface EntitlementSubscriptionSnapshot {
  id: number;
  subscriptionNumber: string;
  subscriptionType: string | null;
  status: string;
  derivedStatus: string;
  startDate: string;
  endDate: string;
  remainingAmount: number;
  isTimeBased: boolean;
  timeFrom: string | null;
  timeTo: string | null;
  isLinkedToSessions: boolean;
  sessionsCount: number | null;
  sessionsUsed: number;
  sessionsRemaining: number | null;
  branchId: number;
}

export interface EntitlementMemberSnapshot {
  id: number;
  memberCode: string;
  name: string;
  phone: string | null;
  branchId: number;
  isActive: boolean;
}

export interface EntitlementResult {
  allowed: boolean;
  member: EntitlementMemberSnapshot;
  activeSubscription: EntitlementSubscriptionSnapshot | null;
  reasons: EntitlementReason[];
  warnings: EntitlementReason[];
}

export interface ValidateEntitlementOptions {
  memberId: number;
  branchId?: number;
  at?: Date;
  blockOnOutstanding?: boolean;
  requireActiveSubscription?: boolean;
}
