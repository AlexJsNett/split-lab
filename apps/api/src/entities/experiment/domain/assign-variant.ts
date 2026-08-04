import { createHash } from 'crypto';

export interface VariantForAssignment {
  id: string;
  key: string;
  weight: number;
}

export function assignVariant(
  experimentId: string,
  userId: string,
  variants: VariantForAssignment[],
): VariantForAssignment {
  const key = `${experimentId}:${userId}`;
  const hash = createHash('md5').update(key).digest('hex');
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;

  const sorted = [...variants].sort((a, b) => a.id.localeCompare(b.id));

  let cumulative = 0;
  for (const variant of sorted) {
    cumulative += variant.weight;
    if (bucket < cumulative) {
      return variant;
    }
  }

  throw new Error('No variant matched bucket — weights do not sum to 100');
}
