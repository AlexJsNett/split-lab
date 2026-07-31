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
  // 1. const key = experimentId + ':' + userId;

  // 2. hash key через createHash('md5').update(key).digest('hex')

  // 3. взять кусок hex-строки, parseInt(..., 16) -> число

  // 4. bucket = число % 100

  // 5. отсортировать variants по id (копию массива, .slice() перед .sort() -
  //    .sort() мутирует исходный массив, а variants пришёл снаружи функции)

  // 6. цикл: cumulative += variant.weight, как только bucket < cumulative -> return variant

  throw new Error('not implemented');
}
