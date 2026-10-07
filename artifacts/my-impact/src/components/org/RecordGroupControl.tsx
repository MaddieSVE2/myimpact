import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { setRecordGroup, type MyGroup } from "@/lib/org-groups";

/**
 * Which group a past activity counts for, changeable from history. Shown to
 * members in at least one group, so activities logged before they joined
 * (or before groups existed) can be counted too.
 */
export function RecordGroupControl({
  recordId,
  groupId,
  groups,
}: {
  recordId: string;
  groupId: string | null;
  groups: MyGroup[];
}) {
  const { toast } = useToast();
  const [value, setValue] = useState<string | null>(groupId);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(groupId), [groupId]);

  if (groups.length === 0 && !groupId) return null;
  const known = value === null || groups.some((g) => g.id === value);

  const change = async (next: string | null) => {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      await setRecordGroup(recordId, next);
    } catch (err) {
      setValue(previous);
      toast({ title: "Could not change the group", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const id = `record-group-${recordId}`;
  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <label htmlFor={id} className="text-[10px] font-semibold text-muted-foreground">
        Group
      </label>
      <select
        id={id}
        value={value ?? ""}
        disabled={saving}
        onChange={(e) => void change(e.target.value || null)}
        className="text-[10px] border border-border rounded-full bg-white px-2 py-0.5 text-foreground disabled:opacity-60"
        data-testid={`select-record-group-${recordId}`}
      >
        <option value="">No group</option>
        {!known && value && <option value={value}>A group you have left</option>}
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </span>
  );
}
