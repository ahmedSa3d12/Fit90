export function canConvertLead(lead: { phone?: string | null; status?: string | null }): boolean {
  return Boolean(lead.phone?.trim()) && lead.status !== 'converted';
}
