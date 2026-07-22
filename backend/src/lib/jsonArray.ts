export function toJsonArray(values: string[] | null | undefined): string {
  return JSON.stringify(values ?? []);
}

export function fromJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
