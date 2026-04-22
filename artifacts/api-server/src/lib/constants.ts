export const CLIENT_NAME = "Tom Lam";
export const HOURLY_RATE = 7.5;

export function computeAmount(seconds: number): number {
  return Math.round((seconds / 3600) * HOURLY_RATE * 100) / 100;
}
