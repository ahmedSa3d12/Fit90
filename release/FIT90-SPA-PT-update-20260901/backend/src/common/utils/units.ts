export type RecipeUnit = 'g' | 'kg' | 'ml' | 'L' | 'piece';

const CONVERSIONS: Record<string, number> = {
  'kg->g': 1000,
  'g->kg': 0.001,
  'L->ml': 1000,
  'ml->L': 0.001,
  'piece->piece': 1,
};

/** Convert a recipe quantity into the ingredient's base unit. Returns null if incompatible. */
export function convertToBaseUnit(
  quantity: number,
  fromUnit: RecipeUnit,
  baseUnit: string,
): number | null {
  const normalizedBase = baseUnit.trim().toLowerCase();
  const normalizedFrom = fromUnit.trim().toLowerCase();
  if (normalizedFrom === normalizedBase) return quantity;
  const key = `${normalizedFrom}->${normalizedBase}`;
  const factor = CONVERSIONS[key];
  if (factor == null) return null;
  return quantity * factor;
}

export function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase();
}
