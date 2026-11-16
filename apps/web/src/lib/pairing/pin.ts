export const PIN_LENGTH = 6;

const RANGE = 10 ** PIN_LENGTH;
// largest multiple of RANGE below 2^32; values above it would bias low PINs
const LIMIT = Math.floor(2 ** 32 / RANGE) * RANGE;

export function generatePin(
  getRandomValues: (a: Uint32Array) => Uint32Array = (a) => crypto.getRandomValues(a),
): string {
  const buf = new Uint32Array(1);
  let value: number;
  do {
    value = getRandomValues(buf)[0]!;
  } while (value >= LIMIT);
  return (value % RANGE).toString().padStart(PIN_LENGTH, "0");
}
