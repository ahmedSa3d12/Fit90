export type PotentialLeadForMember = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  branchId: number | null;
  sourceId: number | null;
  assignedTo: number | null;
  notes: string | null;
};

export function potentialLeadToMemberPrefill(lead: PotentialLeadForMember) {
  return {
    name: lead.name,
    email: lead.email ?? '',
    gender: lead.gender === 'female' ? 'female' as const : 'male' as const,
    branchId: lead.branchId ?? undefined,
    sourceId: lead.sourceId != null ? String(lead.sourceId) : '',
    salesId: lead.assignedTo ?? undefined,
    notes: lead.notes ?? '',
  };
}
