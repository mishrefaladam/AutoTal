"use client";

import { useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addEquipment, equipmentLines, matchesEquipment, removeEquipment, MAX_CUSTOM_EQUIPMENT_LENGTH } from "@/modules/vehicles/equipment";
import type { EquipmentCategory } from "@/modules/vehicles/equipment-catalog";

export function EquipmentSelect({ id, value, onChange, onBlur, catalog, disabled, invalid, describedBy }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  catalog: readonly EquipmentCategory[];
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [query, setQuery] = useState("");
  const selected = equipmentLines(value);
  const contains = (option: string) => selected.some((item) => item.toLowerCase() === option.toLowerCase());
  const update = (next: string[]) => onChange(next.join("\n"));
  const trimmed = query.trim();
  const canAdd = trimmed.length > 0 && trimmed.length <= MAX_CUSTOM_EQUIPMENT_LENGTH && !contains(trimmed);
  const groups = catalog.map((group) => ({ ...group, options: group.options.filter((option) => matchesEquipment(option, query)) }));
  const addCustom = () => {
    if (!canAdd) return;
    update(addEquipment(selected, trimmed));
    setQuery("");
  };

  return (
    <div className="min-w-0 space-y-3">
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute left-3 top-3 size-4" aria-hidden="true" />
        <Input id={id} value={query} onChange={(event) => setQuery(event.target.value)}
          onBlur={onBlur} disabled={disabled} aria-invalid={invalid} aria-describedby={describedBy}
          placeholder="Suchen oder eigenen Eintrag ergänzen" className="pl-9"
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }} />
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Ausgewählte Einträge">
        {selected.map((item) => (
          <span key={item.toLowerCase()} className="bg-muted inline-flex max-w-full items-center gap-1 rounded-md py-1 pl-2 text-sm">
            <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{item}</span>
            <button type="button" disabled={disabled} onClick={() => update(removeEquipment(selected, item))}
              aria-label={`${item} entfernen`} title={`${item} entfernen`}
              className="hover:bg-background focus-visible:ring-ring flex size-9 shrink-0 items-center justify-center rounded-sm focus-visible:ring-2">
              <X className="size-4" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <p className="text-muted-foreground text-xs" aria-live="polite">{selected.length} ausgewählt</p>
      <div className="max-h-72 overflow-y-auto rounded-md border px-3 divide-y">
        {groups.filter((group) => group.options.length > 0).map((group) => (
          <details key={`${group.name}-${Boolean(trimmed)}`} open={trimmed ? true : undefined} className="py-1">
            <summary className="cursor-pointer py-2 text-sm font-medium">{group.name} ({group.options.length})</summary>
            <div className="grid gap-x-4 sm:grid-cols-2">
              {group.options.map((option) => (
                <label key={option} className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm">
                  <input type="checkbox" checked={contains(option)} disabled={disabled} onBlur={onBlur}
                    onChange={(event) => update(event.target.checked ? addEquipment(selected, option) : removeEquipment(selected, option))}
                    className="accent-current size-4 shrink-0" />
                  <span className="min-w-0 [overflow-wrap:anywhere]">{option}</span>
                </label>
              ))}
            </div>
          </details>
        ))}
        {groups.every((group) => group.options.length === 0) && <p className="py-3 text-sm text-muted-foreground">Keine Katalogtreffer</p>}
      </div>
      {canAdd && (
        <Button type="button" variant="outline" disabled={disabled} onClick={addCustom} className="h-auto min-h-11 max-w-full whitespace-normal text-left">
          <Plus className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 [overflow-wrap:anywhere]">„{trimmed}“ hinzufügen</span>
        </Button>
      )}
      {trimmed.length > MAX_CUSTOM_EQUIPMENT_LENGTH && <p role="alert" className="text-destructive text-sm">Höchstens {MAX_CUSTOM_EQUIPMENT_LENGTH} Zeichen pro Eintrag.</p>}
    </div>
  );
}
