import {
  Briefcase,
  Building,
  CalendarDays,
  CreditCard,
  Dumbbell,
  FileText,
  Fingerprint,
  type LucideIcon,
  PackageSearch,
  Settings,
  Sparkles,
  Users,
} from 'lucide-react';
import { CLUB_ROUTES as CR } from '@/lib/club-routes';
import { FITNESS_ROUTES as FIT } from '@/lib/fitness-routes';

export interface NavItem {
  to: string;
}

/** A collapsible sub-group nested inside a top-level section (3rd level). */
export interface NavGroup {
  id: string;
  icon?: LucideIcon;
  items: NavItem[];
}

/**
 * A top-level section. It may contain direct `items` (2 levels: section → items)
 * and/or nested `groups` (3 levels: section → group → items).
 */
export interface NavSection {
  id: string;
  icon: LucideIcon;
  items?: NavItem[];
  groups?: NavGroup[];
}

/** Translation key for a nav route label. */
export function navRouteKey(to: string): string {
  return `nav.routes.${to}`;
}

/** Resolve a navigable path to a human label (never returns a raw i18n key). */
export function translateNavRoute(
  t: (key: string) => string,
  to: string,
): string {
  const key = navRouteKey(to);
  const label = t(key);
  if (label !== key) return label;

  const hubMatch = /^\/hub\/([^/]+)$/.exec(to);
  if (hubMatch) {
    const hubId = hubMatch[1];
    const sectionLabel = t(navSectionKey(hubId));
    if (sectionLabel !== navSectionKey(hubId)) return sectionLabel;
    const groupLabel = t(navGroupKey(hubId));
    if (groupLabel !== navGroupKey(hubId)) return groupLabel;
  }

  const tail = to.split('/').filter(Boolean).pop() ?? to;
  return tail.replace(/-/g, ' ');
}

/** Translation key for a top-level section label. */
export function navSectionKey(id: string): string {
  return `nav.sections.${id}`;
}

/** Translation key for a nested group label. */
export function navGroupKey(id: string): string {
  return `nav.groups.${id}`;
}

/** Translation key for a section's one-line description (shown on its hub). */
export function navSectionDescKey(id: string): string {
  return `nav.sectionDesc.${id}`;
}

/** The default landing ("hub") route for a top-level section. */
export function navHubPath(id: string): string {
  return `/hub/${id}`;
}

/** Primary landing route — always the section hub overview. */
export function navSectionLandingPath(id: string): string {
  return navHubPath(id);
}

/**
 * FIT90 application navigation. Top-level order: club → hr → settings.
 * Booking areas (Classes, Inbody, Spa) are grouped under the club section.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'club',
    icon: Dumbbell,
    groups: [
      {
        id: 'club-membership',
        icon: Users,
        items: [
          { to: CR.members.reception },
          { to: CR.members.management },
          { to: CR.members.attendance },
          { to: CR.members.settings },
        ],
      },
      {
        id: 'club-subscriptions',
        icon: CreditCard,
        items: [
          { to: CR.subscriptions.list },
          { to: CR.subscriptions.new },
          { to: CR.subscriptions.transfers },
          { to: CR.subscriptions.refunds },
          { to: CR.subscriptions.memberForm },
          { to: CR.subscriptions.settings },
        ],
      },
      {
        id: 'club-classes',
        icon: CalendarDays,
        items: [
          { to: FIT.scheduling.classes },
          { to: FIT.scheduling.classBooking },
          { to: FIT.scheduling.schedule },
          { to: '/club/fitness/availability' },
        ],
      },
      {
        id: 'club-inbody',
        icon: Sparkles,
        items: [{ to: FIT.inbody }, { to: '/club/fitness/inbody-bookings' }],
      },
      {
        id: 'club-spa',
        icon: Building,
        items: [
          { to: FIT.facilities.spaServices },
          { to: FIT.facilities.spaBookings },
        ],
      },
      {
        id: 'club-trainers',
        icon: Users,
        items: [
          { to: FIT.trainers.list },
        ],
      },
      {
        id: 'club-lost-found',
        icon: PackageSearch,
        items: [{ to: '/club/lost-found' }],
      },
    ],
  },
  {
    id: 'hr',
    icon: Briefcase,
    groups: [
      {
        id: 'employees',
        icon: Users,
        items: [{ to: '/employees' }, { to: '/employees/new' }],
      },
      {
        id: 'attendance',
        icon: Fingerprint,
        items: [
          { to: '/attendance' },
          { to: '/attendance/devices' },
          { to: '/attendance/settings' },
          { to: '/attendance/rules' },
        ],
      },
      {
        id: 'settings',
        icon: Settings,
        items: [
          { to: '/org/branches' },
          { to: '/org/job-titles' },
          { to: '/settings/gym-policies' },
          { to: '/settings/sales-staff' },
          { to: '/settings/customer-sources' },
          { to: '/admin/roles' },
          { to: '/admin/exceptions' },
          { to: '/users' },
          { to: '/admin/audit' },
          { to: '/company' },
        ],
      },
    ],
  },
];

/** Icon for a nav route — uses the owning group's icon when available. */
export function navRouteIcon(to: string): LucideIcon {
  for (const section of NAV_SECTIONS) {
    if (section.items?.some((i) => i.to === to)) return section.icon;
    for (const group of section.groups ?? []) {
      if (group.items.some((i) => i.to === to)) return group.icon ?? section.icon;
    }
  }
  return FileText;
}

/** Every item across the whole tree (flat + nested), in declaration order. */
function allItems(): NavItem[] {
  const out: NavItem[] = [];
  for (const section of NAV_SECTIONS) {
    if (section.items) out.push(...section.items);
    if (section.groups) for (const g of section.groups) out.push(...g.items);
  }
  return out;
}

/** All navigable route paths inside a section (for quick-access + permissions). */
export function sectionRoutePaths(sectionId: string): string[] {
  const section = NAV_SECTIONS.find((s) => s.id === sectionId);
  if (!section) return [];
  const paths: string[] = [];
  if (section.items) paths.push(...section.items.map((i) => i.to));
  if (section.groups) for (const g of section.groups) paths.push(...g.items.map((i) => i.to));
  return paths;
}

/** The single best-matching item path for the current location (longest prefix wins). */
export function activeNavPath(pathname: string): string {
  let best = '';
  for (const item of allItems()) {
    if (pathname === item.to || pathname.startsWith(item.to + '/')) {
      if (item.to.length > best.length) best = item.to;
    }
  }
  return best;
}

/** The top-level section id that owns the current location. */
export function activeSectionId(pathname: string): string | null {
  // A section's own hub page (`/hub/<id>`) belongs to that section.
  const hub = /^\/hub\/([^/?#]+)/.exec(pathname);
  if (hub && NAV_SECTIONS.some((s) => s.id === hub[1])) return hub[1];

  const path = activeNavPath(pathname);
  if (!path) return null;
  for (const section of NAV_SECTIONS) {
    if (section.items?.some((i) => i.to === path)) return section.id;
    if (section.groups?.some((g) => g.items.some((i) => i.to === path))) return section.id;
  }
  return null;
}

/** The nested sub-group id that owns the current location (null when the active item is a direct section item). */
export function activeGroupId(pathname: string): string | null {
  const path = activeNavPath(pathname);
  if (!path) return null;
  for (const section of NAV_SECTIONS) {
    const g = section.groups?.find((grp) => grp.items.some((i) => i.to === path));
    if (g) return g.id;
  }
  return null;
}
