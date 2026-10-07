import { NO_GROUP, type ManagedGroup } from "@/lib/org-groups";

/**
 * Chooses which part of the organisation a report covers. Managers: the
 * whole organisation, one group, or activities counted for no group. Leads:
 * their own groups. Hidden for managers of organisations without groups.
 */
export function GroupFilter({
  groups,
  isManager,
  value,
  onChange,
}: {
  groups: ManagedGroup[];
  isManager: boolean;
  value: string | null;
  onChange: (groupId: string | null) => void;
}) {
  if (groups.length === 0) return null;
  const allLabel = isManager ? "Whole organisation" : groups.length > 1 ? "All my groups" : null;
  return (
    <div className="inline-flex items-center gap-2">
      <label htmlFor="report-group-filter" className="text-[13px] font-medium text-muted-foreground">
        Showing
      </label>
      <select
        id="report-group-filter"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="border border-border rounded-lg bg-white px-2.5 py-1.5 text-[13px] text-foreground"
        data-testid="select-report-group"
      >
        {allLabel && <option value="">{allLabel}</option>}
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
            {g.archivedAt ? " (archived)" : ""}
          </option>
        ))}
        {isManager && <option value={NO_GROUP}>Not in a group</option>}
      </select>
    </div>
  );
}
