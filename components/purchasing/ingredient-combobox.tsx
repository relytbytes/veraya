"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Plus, ChevronDown, Check, Loader2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

export interface IngredientOption {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  barcode?: string | null;
  supplier?: { name: string } | null;
}

interface Props {
  value: string;                // selected ingredient id
  onChange: (id: string, ingredient: IngredientOption) => void;
  ingredients: IngredientOption[];
  onCreateNew?: (name: string) => void; // called when user clicks "+ Create"
  placeholder?: string;
  className?: string;
}

export function IngredientCombobox({
  value,
  onChange,
  ingredients,
  onCreateNew,
  placeholder = "Search ingredients…",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = ingredients.find((i) => i.id === value);

  const filtered = query.trim()
    ? ingredients.filter((i) =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        i.unit.toLowerCase().includes(query.toLowerCase()) ||
        (i.barcode ?? "").includes(query)
      )
    : ingredients;

  const exactMatch = ingredients.some(
    (i) => i.name.toLowerCase() === query.toLowerCase()
  );

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function select(ing: IngredientOption) {
    onChange(ing.id, ing);
    setOpen(false);
    setQuery("");
  }

  function handleOpen() {
    setOpen(true);
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "w-full flex items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          open && "ring-2 ring-ring ring-offset-background",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="truncate">
          {selected ? (
            <span className="flex items-center gap-2">
              <span className="font-medium text-foreground">{selected.name}</span>
              <span className="text-xs text-muted-foreground">({selected.unit})</span>
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Escape") { setOpen(false); setQuery(""); }
                if (e.key === "Enter" && filtered.length === 1) select(filtered[0]);
              }}
            />
          </div>

          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && !query && (
              <p className="py-4 text-center text-xs text-muted-foreground">No ingredients</p>
            )}
            {filtered.map((ing) => (
              <button
                key={ing.id}
                type="button"
                onClick={() => select(ing)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent transition-colors text-left",
                  ing.id === value && "bg-accent"
                )}
              >
                <Check className={cn("h-3.5 w-3.5 shrink-0", ing.id === value ? "opacity-100 text-amber-500" : "opacity-0")} />
                <span className="flex-1 min-w-0">
                  <span className="font-medium truncate block">{ing.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatCurrency(Number(ing.costPerUnit))} / {ing.unit}
                    {ing.supplier ? ` · ${ing.supplier.name}` : ""}
                  </span>
                </span>
              </button>
            ))}

            {/* Create new option */}
            {onCreateNew && query.trim() && !exactMatch && (
              <button
                type="button"
                onClick={() => {
                  onCreateNew(query.trim());
                  setOpen(false);
                  setQuery("");
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-amber-600 hover:bg-amber-50 border-t border-border transition-colors"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span>Create <strong>&quot;{query.trim()}&quot;</strong> as new ingredient</span>
              </button>
            )}

            {filtered.length === 0 && query && !onCreateNew && (
              <p className="py-3 text-center text-xs text-muted-foreground">No matches for &quot;{query}&quot;</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
