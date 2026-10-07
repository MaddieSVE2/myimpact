import type { MyGroup } from "@/lib/org-groups";

/**
 * "Which group is this for?" for members in more than one group. Each
 * activity counts for one group at most, so organisation reports add up.
 * Renders nothing for members in fewer than two groups: one group is
 * filled in automatically and none needs no choice.
 */
export function GroupPicker({
  id,
  groups,
  value,
  onChange,
  disabled,
  label = "Which group is this for?",
  compact = false,
}: {
  id: string;
  groups: MyGroup[];
  value: string | null;
  onChange: (groupId: string | null) => void;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
}) {
  if (groups.length < 2) return null;
  return (
    <div className={compact ? "flex items-center gap-2" : "space-y-1.5"}>
      <label htmlFor={id} className={compact ? "text-xs text-muted-foreground" : "block text-sm font-medium text-foreground"}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        className={`border border-border rounded-lg bg-white text-foreground disabled:opacity-60 ${compact ? "px-2 py-1 text-xs" : "w-full px-3 py-2 text-sm"}`}
        data-testid={`${id}-select`}
      >
        <option value="">No group</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {!compact && (
        <p className="text-xs text-muted-foreground">
          It counts towards that group's report in your organisation. You can change it later in your history.
        </p>
      )}
    </div>
  );
}
