import { Prisma } from '@prisma/client';

/** Job title (المسمى الوظيفي) for club member «أخصائي مبيعات» dropdown + sales-scope filter. */
export const SALES_SPECIALIST_JOB_TITLE = 'أخصائي مبيعات';

/** Common spelling variants used by existing employee records. */
export const SALES_SPECIALIST_JOB_TITLE_VARIANTS = [
  'اخصائى مبيعات',
  'أخصائى مبيعات',
  'اخصائي مبيعات',
] as const;

/** Legacy title kept for matching existing employee rows. */
export const LEGACY_SALES_SPECIALIST_TITLES = ['مسؤول تسويق', 'مندوب المبيعات'] as const;

export const SALES_SPECIALIST_JOB_TITLES = [
  SALES_SPECIALIST_JOB_TITLE,
  ...SALES_SPECIALIST_JOB_TITLE_VARIANTS,
  ...LEGACY_SALES_SPECIALIST_TITLES,
] as const;

/** @deprecated Use SALES_SPECIALIST_JOB_TITLE */
export const MARKETING_REP_JOB_TITLE = SALES_SPECIALIST_JOB_TITLE;

const STRICT_SALES_SPECIALIST_TITLES = [
  SALES_SPECIALIST_JOB_TITLE,
  ...SALES_SPECIALIST_JOB_TITLE_VARIANTS,
] as const;

export const salesSpecialistJobTitleWhere: Prisma.department_jobsWhereInput = {
  OR: STRICT_SALES_SPECIALIST_TITLES.flatMap((title) => [
    { name: title },
    { name: { contains: title } },
  ]),
};

export function salesSpecialistEmployeeWhere(jobIds: number[]): Prisma.employeesWhereInput {
  const titleMatch = STRICT_SALES_SPECIALIST_TITLES.flatMap((title) => [
    { mosma_wazefy_n: title },
    { mosma_wazefy_n: { contains: title } },
  ]);
  return {
    OR: [...(jobIds.length ? [{ mosma_wazefy_code: { in: jobIds } }] : []), ...titleMatch],
  };
}

export const marketingRepJobTitleWhere: Prisma.department_jobsWhereInput = {
  OR: SALES_SPECIALIST_JOB_TITLES.flatMap((title) => [
    { name: title },
    { name: { contains: title } },
  ]),
};

export function isMarketingRepJobTitle(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  const n = name.trim();
  return SALES_SPECIALIST_JOB_TITLES.some((title) => n === title || n.includes(title));
}

export function marketingRepEmployeeWhere(jobIds: number[]): Prisma.employeesWhereInput {
  const titleMatch = SALES_SPECIALIST_JOB_TITLES.flatMap((title) => [
    { mosma_wazefy_n: title },
    { mosma_wazefy_n: { contains: title } },
  ]);
  return {
    OR: [...(jobIds.length ? [{ mosma_wazefy_code: { in: jobIds } }] : []), ...titleMatch],
  };
}
