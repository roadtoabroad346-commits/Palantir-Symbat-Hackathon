/** Keep a country's marker fan separated in screen pixels at every camera zoom. */
export function screenMarkerFan(count = 5): { x: number; y: number }[] {
  if (!Number.isInteger(count) || count < 0 || count > 200)
    throw new Error("Marker count must be an integer from 0 to 200");
  if (count === 0) return [];
  if (count === 1) return [{ x: 0, y: 0 }];
  const radius = Math.max(34, 18 / Math.sin(Math.PI / count));
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return {
      x: Number((radius * Math.cos(angle)).toFixed(6)),
      y: Number((radius * Math.sin(angle)).toFixed(6)),
    };
  });
}
