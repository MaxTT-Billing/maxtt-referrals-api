export function computeReward(amountInr: number): number {
  const pct = 0.02; // 2%
  const raw = amountInr * pct;
  // round to nearest ₹10
  return Math.round(raw / 10) * 10;
}
