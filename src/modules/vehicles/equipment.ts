/** Shared by admin inputs, imports and DTOs. Never truncate existing data. */
export const MAX_CUSTOM_EQUIPMENT_LENGTH = 160;

export function mergeEquipment(...lists: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const list of lists) {
    for (const raw of list) {
      const value = raw.trim();
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      result.push(value);
    }
  }
  return result;
}

export function equipmentLines(value: string): string[] {
  return mergeEquipment(value.split(/\r?\n/));
}

export function addEquipment(values: readonly string[], raw: string): string[] {
  const value = raw.trim();
  if (!value || value.length > MAX_CUSTOM_EQUIPMENT_LENGTH || /[\r\n]/.test(value)) {
    return [...values];
  }
  return mergeEquipment(values, [value]);
}

export function removeEquipment(values: readonly string[], value: string): string[] {
  return values.filter((item) => item.trim().toLowerCase() !== value.trim().toLowerCase());
}

export function equipmentSearchKey(value: string): string {
  return value.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe")
    .replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function matchesEquipment(value: string, query: string): boolean {
  const key = equipmentSearchKey(value);
  return equipmentSearchKey(query).split(/\s+/).filter(Boolean).every((word) => key.includes(word));
}
