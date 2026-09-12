import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Whitelisted editable company fields (conf_company_data has ~70 legacy columns).
 * Mirrors the full Config_company::index() field set: nameweb, abbreviation_name,
 * slogan, summary_company, website, email, address, telepon, hp, fax, keywords,
 * metatext, facebook, twitter, instagram, google_map, image. `logo` is kept for
 * the new logo upload path. `max_num` is privileged (see updateCompany).
 */
const COMPANY_EDITABLE = [
  'nameweb',
  'abbreviation_name',
  'slogan',
  'summary_company',
  'website',
  'email',
  'address',
  'telepon',
  'hp',
  'fax',
  'keywords',
  'metatext',
  'facebook',
  'twitter',
  'instagram',
  'google_map',
  'image',
  'logo',
] as const;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCompany() {
    return this.prisma.conf_company_data.findFirst({ orderBy: { id_config: 'asc' } });
  }

  /**
   * Update the single company-config row.
   * @param userId current users.user_id — legacy only allows `max_num` to be
   *   changed by the super-admin (`$_SESSION['userid'] == 1`) and stamps `id_user`.
   */
  async updateCompany(patch: Record<string, unknown>, userId?: number) {
    const row = await this.getCompany();
    if (!row) return null;
    const data: Record<string, unknown> = {};
    for (const key of COMPANY_EDITABLE) {
      if (key in patch) data[key] = patch[key];
    }
    // Privileged field: max_num editable only by user_id == 1 (legacy parity).
    if ('max_num' in patch && userId === 1) {
      const raw = patch['max_num'];
      const num = raw === null || raw === '' ? null : Number(raw);
      data['max_num'] = num !== null && !Number.isNaN(num) ? num : null;
    }
    // Stamp the editor (legacy sets id_user = session id).
    if (userId !== undefined) data['id_user'] = userId;
    return this.prisma.conf_company_data.update({ where: { id_config: row.id_config }, data });
  }

  async getGlobal() {
    const g = await this.prisma.global_settings.findFirst({ orderBy: { id: 'asc' } });
    if (!g) return null;
    return {
      id: g.id,
      instituteName: g.institute_name,
      instituteEmail: g.institute_email,
      address: g.address,
      mobile: g.mobileno,
      logo: g.logo,
      currency: g.currency,
      currencySymbol: g.currency_symbol,
      timezone: g.timezone,
      footerText: g.footer_text,
      alertDaysContract: g.alert_days_contract,
      alertDaysResidency: g.alert_days_quest,
    };
  }
}
