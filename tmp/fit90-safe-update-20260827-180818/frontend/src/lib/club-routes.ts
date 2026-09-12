/** All club module routes — mirrors SwatGym sidebar structure under `/club`. */
export const CLUB_ROUTES = {
  dashboard: '/hub/club',
  members: {
    reception: '/club/reception',
    management: '/club/members',
    cards: '/club/members/cards',
    barcodeSearch: '/club/members/barcode-search',
    barcodeManagement: '/club/members/barcode-management',
    attendance: '/club/members/attendance',
    groups: '/club/members/groups',
    surveys: '/club/members/surveys',
    settings: '/club/members/settings',
  },
  subscriptions: {
    list: '/club/subscriptions',
    new: '/club/subscriptions/new',
    special: '/club/subscriptions/special',
    timeBased: '/club/subscriptions/time-based',
    transfers: '/club/subscriptions/transfers',
    memberTransfer: '/club/subscriptions/member-transfer',
    refunds: '/club/subscriptions/refunds',
    receipts: '/club/subscriptions/receipts',
    financialReports: '/club/subscriptions/financial-reports',
    expired: '/club/subscriptions/expired',
    outstanding: '/club/subscriptions/outstanding',
    memberFinancial: '/club/subscriptions/member-financial',
    treasury: '/club/subscriptions/treasury',
    unifiedTreasury: '/club/unified-treasury',
    discounts: '/club/subscriptions/discounts',
    settings: '/club/subscriptions/settings',
    memberForm: '/club/subscriptions/member-form',
  },
  lockers: {
    list: '/club/lockers',
    new: '/club/lockers/new',
    settings: '/club/lockers/settings',
  },
  cafe: {
    products: '/club/cafe/products',
    categories: '/club/cafe/categories',
    pos: '/club/cafe/pos',
  },
} as const;

export type ClubMembersView =
  | 'members'
  | 'attendance'
  | 'types'
  | 'financial';

export type ClubSubscriptionsView =
  | 'subs'
  | 'receipts'
  | 'refunds'
  | 'transfers'
  | 'outstanding'
  | 'types'
  | 'reports';

export type ClubLockersView = 'subscriptions' | 'lockers' | 'types';
