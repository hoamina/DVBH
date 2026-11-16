import { useLocalStorageState } from "../hooks/useLocalStorageState";

export interface PhReportGroup { name: string; stations: string[] }
export function usePhReportGroups() {
  return useLocalStorageState<PhReportGroup[]>("reports:PH:station-groups:v1", [{ name: "Brills", stations: [] }]);
}
export function phGroupForStation(station: string | null | undefined, groups: PhReportGroup[]): string {
  return groups.find((g) => g.stations.includes(station ?? ""))?.name ?? "KRF";
}
export function sumReportRows<T extends { nhom: string }>(rows: T[], group: (row: T) => string): T[] {
  const result = new Map<string, T>();
  for (const row of rows) {
    const name = group(row);
    let target = result.get(name);
    if (!target) { target = { nhom: name } as T; result.set(name, target); }
    for (const [key, value] of Object.entries(row)) {
      if (typeof value === "number") (target as Record<string, unknown>)[key] = Number((target as Record<string, unknown>)[key] ?? 0) + value;
    }
  }
  return [...result.values()];
}
