export function getUserAvatarBackground(userId: number): string {
  const safeUserId = Number.isFinite(userId) ? Math.abs(Math.trunc(userId)) : 0;
  const hue = (safeUserId * 137 + 29) % 360;
  return `hsl(${hue} 68% 48%)`;
}
