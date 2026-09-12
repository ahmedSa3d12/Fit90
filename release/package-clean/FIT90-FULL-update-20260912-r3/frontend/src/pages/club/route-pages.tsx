/** Thin route wrappers — one export per sidebar link. */
import { Navigate, useNavigationType } from 'react-router-dom';
import { ClubMembersPage } from './members';
import { ClubSubscriptionsPage } from './subscriptions';
import { ClubSubscriptionRefundsPage } from './subscription-refunds';
import { ClubPackageSettingsPage } from './package-settings';

export { ClubReceptionPage } from './reception';
export { ClubMemberFormPage } from './member-form';

export function ClubSubscriptionsListPage() {
  return <ClubSubscriptionsPage />;
}

export function ClubMembersManagementPage() {
  return <ClubMembersPage singleView="members" />;
}
export function ClubMembersAttendancePage() {
  return <ClubMembersPage singleView="attendance" />;
}
export function ClubMembersSettingsPage() {
  return <ClubMembersPage singleView="types" />;
}

export function ClubSubscriptionsNewPage() {
  const navigationType = useNavigationType();
  // This is an action route. Refreshing or loading it directly must not
  // reopen the create dialog; only in-app navigation to it may do so.
  if (navigationType === 'POP') {
    return <Navigate to="/club/subscriptions" replace />;
  }
  return <ClubSubscriptionsPage openCreateOnMount />;
}
export function ClubSubscriptionsTransfersPage() {
  return <ClubSubscriptionsPage singleView="transfers" />;
}
export function ClubSubscriptionsRefundsPage() {
  return <ClubSubscriptionRefundsPage />;
}
export function ClubSubscriptionsSettingsPage() {
  return <ClubPackageSettingsPage />;
}
