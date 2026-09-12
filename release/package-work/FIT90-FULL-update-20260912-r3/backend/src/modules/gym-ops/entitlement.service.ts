import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { deriveSubStatus, toNum } from '../club-subscriptions/club-subscription.utils';
import { ClubGymPoliciesService } from './club-gym-policies.service';
import {
  EntitlementReason,
  EntitlementResult,
  EntitlementSubscriptionSnapshot,
  ValidateEntitlementOptions,
} from './entitlement.types';

const EGYPT_TZ = 'Africa/Cairo';

function parseYmdLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function subscriptionElapsedPercent(startDate: string, endDate: string, at: Date): number {
  const start = parseYmdLocal(startDate).getTime();
  const end = parseYmdLocal(endDate).getTime();
  const now = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const total = end - start;
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, ((now - start) / total) * 100));
}

function currentLocalTimeHHMM(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: EGYPT_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}

function isWithinTimeWindow(timeFrom: string, timeTo: string, at: Date): boolean {
  const current = currentLocalTimeHHMM(at);
  if (timeFrom <= timeTo) return current >= timeFrom && current <= timeTo;
  return current >= timeFrom || current <= timeTo;
}

@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gymPolicies: ClubGymPoliciesService,
  ) {}

  private mapSubscription(row: {
    id: number;
    subscription_number: string;
    subscription_type: string | null;
    status: string;
    subscription_start_date: string;
    subscription_end_date: string;
    remaining_amount: unknown;
    is_time_based: boolean;
    time_from: string | null;
    time_to: string | null;
    is_linked_to_sessions: boolean;
    sessions_count: number | null;
    sessions_used: number;
    branch_id: number;
  }): EntitlementSubscriptionSnapshot {
    const derivedStatus = deriveSubStatus(row.subscription_start_date, row.subscription_end_date);
    const sessionsRemaining =
      row.is_linked_to_sessions && row.sessions_count != null
        ? Math.max(0, row.sessions_count - row.sessions_used)
        : null;

    return {
      id: row.id,
      subscriptionNumber: row.subscription_number,
      subscriptionType: row.subscription_type,
      status: row.status,
      derivedStatus,
      startDate: row.subscription_start_date,
      endDate: row.subscription_end_date,
      remainingAmount: toNum(row.remaining_amount),
      isTimeBased: row.is_time_based,
      timeFrom: row.time_from,
      timeTo: row.time_to,
      isLinkedToSessions: row.is_linked_to_sessions,
      sessionsCount: row.sessions_count,
      sessionsUsed: row.sessions_used,
      sessionsRemaining,
      branchId: row.branch_id,
    };
  }

  private reason(
    code: string,
    messageAr: string,
    messageEn: string,
    severity: EntitlementReason['severity'],
  ): EntitlementReason {
    return { code, messageAr, messageEn, severity };
  }

  async validate(options: ValidateEntitlementOptions): Promise<EntitlementResult> {
    const {
      memberId,
      branchId,
      at = new Date(),
      blockOnOutstanding,
      requireActiveSubscription = true,
    } = options;

    const policies = await this.gymPolicies.get();
    const effectiveBlockOnOutstanding =
      blockOnOutstanding ?? !policies.allowCheckInWithOutstanding;

    const member = await this.prisma.club_members.findFirst({
      where: { id: memberId, is_deleted: false },
    });
    if (!member) throw new NotFoundException('العضو غير موجود');

    const reasons: EntitlementReason[] = [];
    const warnings: EntitlementReason[] = [];

    if (!member.is_active) {
      reasons.push(
        this.reason(
          'member_inactive',
          'العضو غير نشط',
          'Member account is inactive',
          'block',
        ),
      );
    }

    const subs = await this.prisma.club_subscriptions.findMany({
      where: { member_id: memberId },
      orderBy: { subscription_end_date: 'desc' },
    });

    const activeCandidates = subs.filter(
      (s) => deriveSubStatus(s.subscription_start_date, s.subscription_end_date) === 'active',
    );

    const branchFiltered =
      branchId != null
        ? activeCandidates.filter((s) => s.branch_id === branchId)
        : activeCandidates;

    const activeSub = branchFiltered[0] ?? activeCandidates[0] ?? null;

    if (requireActiveSubscription && !activeSub) {
      reasons.push(
        this.reason(
          'no_active_subscription',
          'لا يوجد اشتراك نشط',
          'No active subscription',
          'block',
        ),
      );
    }

    let snapshot: EntitlementSubscriptionSnapshot | null = null;
    if (activeSub) {
      snapshot = this.mapSubscription(activeSub);

      // A frozen subscription (stored status) is denied check-in regardless of its date-derived
      // status. The freeze is an explicit hold on the subscription.
      if (snapshot.status === 'frozen') {
        reasons.push(
          this.reason(
            'subscription_frozen',
            'الاشتراك مجمد',
            'Subscription is frozen',
            'block',
          ),
        );
      }

      if (effectiveBlockOnOutstanding && snapshot.remainingAmount > 0) {
        reasons.push(
          this.reason(
            'outstanding_balance',
            `رصيد مستحق: ${snapshot.remainingAmount}`,
            `Outstanding balance: ${snapshot.remainingAmount}`,
            'block',
          ),
        );
      } else if (snapshot.remainingAmount > 0 && policies.outstandingAlertEnabled) {
        const elapsedPct = subscriptionElapsedPercent(snapshot.startDate, snapshot.endDate, at);
        if (elapsedPct >= policies.outstandingAlertAfterSubscriptionPercent) {
          warnings.push(
            this.reason(
              'outstanding_balance',
              `رصيد مستحق: ${snapshot.remainingAmount}`,
              `Outstanding balance: ${snapshot.remainingAmount}`,
              'warn',
            ),
          );
        }
      }

      if (snapshot.isTimeBased && snapshot.timeFrom && snapshot.timeTo) {
        if (!isWithinTimeWindow(snapshot.timeFrom, snapshot.timeTo, at)) {
          reasons.push(
            this.reason(
              'outside_time_window',
              `الدخول مسموح من ${snapshot.timeFrom} إلى ${snapshot.timeTo} فقط`,
              `Access allowed only ${snapshot.timeFrom}–${snapshot.timeTo}`,
              'block',
            ),
          );
        }
      }

      if (snapshot.isLinkedToSessions) {
        const remaining = snapshot.sessionsRemaining ?? 0;
        if (remaining <= 0) {
          reasons.push(
            this.reason(
              'no_sessions_remaining',
              'لا توجد حصص متبقية',
              'No sessions remaining',
              'block',
            ),
          );
        }
      }

      if (branchId != null && snapshot.branchId !== branchId) {
        warnings.push(
          this.reason(
            'branch_mismatch',
            'الاشتراك مسجّل على فرع آخر',
            'Subscription belongs to another branch',
            'warn',
          ),
        );
      }
    }

    const blocking = reasons.some((r) => r.severity === 'block');

    return {
      allowed: !blocking,
      member: {
        id: member.id,
        memberCode: member.member_code,
        name: member.name,
        phone: member.phone,
        branchId: member.branch_id,
        isActive: member.is_active,
      },
      activeSubscription: snapshot,
      reasons,
      warnings,
    };
  }
}
