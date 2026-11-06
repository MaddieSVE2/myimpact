import { useReportGroups } from "@/lib/org-groups";

/**
 * Who an organisation challenge or survey is for. `value` is null for
 * everyone, or the chosen group ids ([] while none are ticked). Shows nothing
 * when the organisation has no active groups, so everything stays for
 * everyone.
 */
export function GroupAudiencePicker({
  value,
  onChange,
  hint,
  name,
}: {
  value: string[] | null;
  onChange: (value: string[] | null) => void;
  /** Says what choosing groups means, under the list of groups. */
  hint: string;
  /** Names the radio buttons; unique on the page. */
  name: string;
}) {
  const { data } = useReportGroups();
  const groups = (data?.groups ?? []).filter((g) => !g.archivedAt);
  if (!data?.canManage || groups.length === 0) return null;

  const toggle = (id: string) => {
    const chosen = value ?? [];
    onChange(chosen.includes(id) ? chosen.filter((g) => g !== id) : [...chosen, id]);
  };

  return (
    <fieldset data-testid={`${name}-audience`}>
      <legend className="block text-[13px] font-medium text-foreground mb-1.5">Who it's for</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        <label className="inline-flex items-center gap-2 text-[13px] text-foreground">
          <input type="radio" name={name} checked={value === null} onChange={() => onChange(null)} className="w-4 h-4 text-primary" />
          Everyone in your organisation
        </label>
        <label className="inline-flex items-center gap-2 text-[13px] text-foreground">
          <input type="radio" name={name} checked={value !== null} onChange={() => onChange(value ?? [])} className="w-4 h-4 text-primary" />
          Chosen groups
        </label>
      </div>
      {value !== null && (
        <div className="mt-2 rounded-lg border border-border bg-white p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {groups.map((g) => (
              <label key={g.id} className="inline-flex items-center gap-2 text-[13px] text-foreground">
                <input
                  type="checkbox"
                  checked={value.includes(g.id)}
                  onChange={() => toggle(g.id)}
                  className="rounded border-border w-4 h-4 text-primary"
                />
                <span className="min-w-0 truncate">{g.name}</span>
                <span className="text-muted-foreground">({g.memberCount})</span>
              </label>
            ))}
          </div>
          <p className={`text-[12px] mt-2 ${value.length === 0 ? "text-red-600" : "text-muted-foreground"}`}>
            {value.length === 0 ? "Tick at least one group." : hint}
          </p>
        </div>
      )}
    </fieldset>
  );
}
