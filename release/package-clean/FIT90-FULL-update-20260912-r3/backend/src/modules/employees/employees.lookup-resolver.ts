import { PrismaService } from '../../common/prisma/prisma.service';

/** Form keys whose UI value is employees_settings.id but DB column stores title_setting. */
export const SETTINGS_STRING_LOOKUPS: Array<{ formKey: string; type: number }> = [
  { formKey: 'type_card', type: 5 },
  { formKey: 'gehat_esdar', type: 6 },
];

const DEFINED_STRING_LOOKUPS: Array<{ formKey: string; type: number; typeName: string }> = [
  { formKey: 'nationality_fk', type: 1, typeName: 'الجنسية' },
  { formKey: 'deyana_fk', type: 2, typeName: 'الديانة' },
];

const NATIONALITY_ALIASES: Record<string, string> = {
  مصر: 'مصري',
  مصريه: 'مصري',
  مصرى: 'مصري',
};

function normalizeTitle(formKey: string, title: string): string {
  if (formKey === 'nationality_fk') return NATIONALITY_ALIASES[title] ?? title;
  return title;
}

/** Dropdown id → DB title before formToData. */
export async function resolveSettingsIdsToTitles(
  prisma: PrismaService,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const out = { ...body };
  for (const { formKey, type } of SETTINGS_STRING_LOOKUPS) {
    if (!(formKey in out)) continue;
    const raw = String(out[formKey] ?? '').trim();
    if (!raw || !/^\d+$/.test(raw)) continue;
    const row = await prisma.employees_settings.findFirst({
      where: { id_setting: Number(raw), type },
    });
    if (row) out[formKey] = row.title_setting;
  }
  for (const { formKey, type, typeName } of DEFINED_STRING_LOOKUPS) {
    if (!(formKey in out)) continue;
    const raw = String(out[formKey] ?? '').trim();
    if (!raw || !/^\d+$/.test(raw)) continue;
    const row = await prisma.all_defined_setting.findFirst({
      where: { defined_id: Number(raw), defined_type: type, defined_type_title: typeName },
    });
    if (row) out[formKey] = row.defined_title;
  }
  return out;
}

/** DB title → dropdown id for edit form prefill. */
export async function resolveSettingsTitlesToIds(
  prisma: PrismaService,
  form: Record<string, string>,
): Promise<Record<string, string>> {
  const out = { ...form };
  for (const { formKey, type } of SETTINGS_STRING_LOOKUPS) {
    const raw = out[formKey]?.trim();
    if (!raw || /^\d+$/.test(raw)) continue;
    const title = normalizeTitle(formKey, raw);
    const row = await prisma.employees_settings.findFirst({
      where: { title_setting: title, type },
    });
    if (row) out[formKey] = String(row.id_setting);
  }
  for (const { formKey, type, typeName } of DEFINED_STRING_LOOKUPS) {
    const raw = out[formKey]?.trim();
    if (!raw || /^\d+$/.test(raw)) continue;
    const title = normalizeTitle(formKey, raw);
    const row = await prisma.all_defined_setting.findFirst({
      where: { defined_title: title, defined_type: type, defined_type_title: typeName },
    });
    if (row) out[formKey] = String(row.defined_id);
  }
  return out;
}
