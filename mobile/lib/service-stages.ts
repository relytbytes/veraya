// Shared service-stage model — mirrors the web host stand (app/(dashboard)/host/host-utils.ts)
// and the colors already used in TableCanvas/HostStandMode.

export const SERVICE_STAGES = [
  "SEATED", "APPS", "ENTREES", "DESSERT", "CHECK_DROPPED", "CHECK_PAID", "BUSSING",
] as const;

export type ServiceStage = (typeof SERVICE_STAGES)[number];

export const STAGE_LABELS: Record<string, string> = {
  SEATED: "Seated",
  APPS: "Apps",
  ENTREES: "Entrees",
  DESSERT: "Dessert",
  CHECK_DROPPED: "Check Dropped",
  CHECK_PAID: "Check Paid",
  BUSSING: "Bussing",
};

export const STAGE_COLOR: Record<string, string> = {
  SEATED:        "#1E7A45",
  APPS:          "#2BB39B",
  ENTREES:       "#E0A82E",
  DESSERT:       "#7C5CBF",
  CHECK_DROPPED: "#2E6EB0",
  CHECK_PAID:    "#2E6EB0",
  BUSSING:       "#D44030",
};

export function elapsedMins(seatedAt: string): number {
  return Math.floor((Date.now() - new Date(seatedAt).getTime()) / 60000);
}

export function elapsedLabel(seatedAt: string): string {
  const m = elapsedMins(seatedAt);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
