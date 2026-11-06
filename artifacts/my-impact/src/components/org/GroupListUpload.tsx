import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { groupsApi, useInvalidateGroups, type GroupListPlan } from "@/lib/org-groups";
import { parseGroupList, type GroupListRow } from "@/lib/group-list";

const PREVIEW_LIMIT = 50;

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-GB")} ${n === 1 ? one : many}`;
}

function doneMessage(plan: GroupListPlan): string {
  const parts = [
    plan.add.length > 0 ? `added ${plural(new Set(plan.add.map((a) => a.email)).size, "person", "people")} to groups` : "",
    plan.newGroups.length > 0 ? `created ${plural(plan.newGroups.length, "group", "groups")}` : "",
    plan.save.length > 0 ? `saved group places for ${plural(new Set(plan.save.map((s) => s.email)).size, "person", "people")}` : "",
  ].filter(Boolean);
  const done = parts.length > 0 ? `Done: ${parts.join(", ")}.` : "Nothing needed adding.";
  return plan.invite.length > 0
    ? `${done} ${plural(plan.invite.length, "invite is", "invites are")} on the way, and they show under Pending invites on the Members tab.`
    : done;
}

function Section({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <div data-testid={testId}>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <div className="mt-1 text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

/**
 * Adding people to groups from a CSV file or rows pasted from a spreadsheet
 * (Settings, Groups tab). The list is checked first, and nothing changes
 * until the manager confirms what it will do.
 */
export function GroupListUpload() {
  const { toast } = useToast();
  const invalidate = useInvalidateGroups();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [rows, setRows] = useState<GroupListRow[] | null>(null);
  const [plan, setPlan] = useState<GroupListPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = (list: GroupListRow[], dryRun: boolean) =>
    groupsApi.addFromList(list.map(({ email, group, role }) => ({ email, group, role })), dryRun);

  const check = async (text: string) => {
    setError(null);
    setPlan(null);
    setResult(null);
    const parsed = parseGroupList(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    try {
      const { plan: checked } = await send(parsed.rows, true);
      setRows(parsed.rows);
      setPlan(checked);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setRows(null);
    setPlan(null);
    setPasted("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const confirm = async () => {
    if (!rows) return;
    setBusy(true);
    try {
      const { plan: done } = await send(rows, false);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["org-group-members"] });
      setResult(doneMessage(done));
      toast({ title: "Added the list to groups" });
      reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lineOf = (row: number) => rows?.[row - 1]?.line ?? row;
  const people = (list: { email: string }[]) => new Set(list.map((p) => p.email)).size;
  const waiting = plan?.save.filter((s) => s.reason !== "invite") ?? [];
  const nothingToDo = plan !== null && plan.add.length === 0 && plan.save.length === 0;

  return (
    <section className="bg-white border border-border rounded-xl p-5 space-y-3" aria-labelledby="group-list-heading" data-testid="group-list-upload">
      <div>
        <h3 id="group-list-heading" className="text-sm font-semibold text-foreground">Add people from a list</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
          Use a CSV file or rows copied from a spreadsheet, with columns Email, Group and, if you like, Role (lead or member). Give
          someone a row for each group they&apos;re in. A group name that doesn&apos;t exist yet makes a new group. People who
          aren&apos;t members yet get an invite and go into their groups when they join.
        </p>
      </div>

      {!plan && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInput}
              id="group-list-file"
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await check(await file.text());
              }}
            />
            <label
              htmlFor="group-list-file"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-semibold cursor-pointer hover:bg-muted/40"
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" /> Choose a CSV file
            </label>
            <span className="text-xs text-muted-foreground">Save an Excel sheet as CSV first, or paste its rows below.</span>
          </div>
          <div>
            <label htmlFor="group-list-paste" className="block text-xs font-medium text-foreground mb-1">Or paste rows</label>
            <textarea
              id="group-list-paste"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={4}
              placeholder={"Email\tGroup\tRole\nsam@example.org\tFootball club\tlead"}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm font-mono"
            />
            <button
              type="button"
              disabled={busy || !pasted.trim()}
              onClick={() => void check(pasted)}
              className="mt-2 px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Checking…" : "Check list"}
            </button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      {result && <p className="text-xs text-emerald-700" role="status" data-testid="group-list-result">{result}</p>}

      {plan && (
        <div className="rounded-lg bg-muted/30 p-4 space-y-3" data-testid="group-list-plan">
          {plan.add.length > 0 && (
            <Section title={`${plural(people(plan.add), "member goes", "members go")} into groups`} testId="plan-add">
              <ul className="space-y-0.5">
                {plan.add.slice(0, PREVIEW_LIMIT).map((a) => (
                  <li key={`${a.email}:${a.group}`}>
                    {a.name} ({a.email}) → {a.group}{a.role === "lead" ? ", as lead" : ""}
                  </li>
                ))}
              </ul>
              {plan.add.length > PREVIEW_LIMIT && <p>and {plural(plan.add.length - PREVIEW_LIMIT, "more", "more")}</p>}
            </Section>
          )}
          {plan.newGroups.length > 0 && (
            <Section title={`${plural(plan.newGroups.length, "new group", "new groups")}`} testId="plan-new-groups">
              <p>{plan.newGroups.join(", ")}</p>
            </Section>
          )}
          {plan.invite.length > 0 && (
            <Section title={`${plural(plan.invite.length, "invite", "invites")} to send`} testId="plan-invite">
              <p>They go into their groups when they join.</p>
              <ul className="space-y-0.5 mt-1">
                {plan.invite.slice(0, PREVIEW_LIMIT).map((email) => <li key={email}>{email}</li>)}
              </ul>
              {plan.invite.length > PREVIEW_LIMIT && <p>and {plural(plan.invite.length - PREVIEW_LIMIT, "more", "more")}</p>}
            </Section>
          )}
          {waiting.length > 0 && (
            <Section title={`${plural(people(waiting), "person", "people")} already invited or waiting for approval`} testId="plan-waiting">
              <p>Their groups are saved, and they go into them once they&apos;re members.</p>
            </Section>
          )}
          {plan.alreadyDone > 0 && (
            <Section title={`${plural(plan.alreadyDone, "row is", "rows are")} already done`} testId="plan-done">
              <p>Those people are already in those groups.</p>
            </Section>
          )}
          {plan.problems.length > 0 && (
            <Section title={`${plural(plan.problems.length, "row", "rows")} can't be used`} testId="plan-problems">
              <ul className="space-y-0.5">
                {plan.problems.slice(0, PREVIEW_LIMIT).map((p) => (
                  <li key={p.row}>
                    Line {lineOf(p.row)}{p.email ? `, ${p.email}` : ""}: {p.problem}
                  </li>
                ))}
              </ul>
              {plan.problems.length > PREVIEW_LIMIT && <p>and {plural(plan.problems.length - PREVIEW_LIMIT, "more", "more")}</p>}
            </Section>
          )}
          {nothingToDo && <p className="text-sm text-foreground">There&apos;s nothing to add from this list.</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            {!nothingToDo && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirm()}
                className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-60"
                data-testid="button-confirm-group-list"
              >
                {busy ? "Adding…" : plan.invite.length > 0 ? `Add and send ${plural(plan.invite.length, "invite", "invites")}` : "Add to groups"}
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={reset}
              className="px-3 py-2 rounded-lg border border-border text-xs font-semibold hover:bg-white disabled:opacity-60"
            >
              {nothingToDo ? "Try another list" : "Cancel"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
