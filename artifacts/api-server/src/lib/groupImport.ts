/**
 * Adding people to groups from a list (Settings, Groups tab): one row per
 * person and group, with an optional role. planGroupImport works out what a
 * list would do without changing anything, so the manager sees it first;
 * routes/org-groups.ts gathers what it needs and carries the plan out.
 */
import { cleanGroupName, normaliseEmail, type GroupRole } from "./orgGroups.js";
import { emailMatchesDomains } from "./orgDomains.js";

export const MAX_IMPORT_ROWS = 1000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ImportRow {
  email: unknown;
  group: unknown;
  role?: unknown;
}

export interface ImportContext {
  /** The organisation's groups, archived ones too. */
  groups: { id: string; name: string; archived: boolean }[];
  /** People with an account, by lower-case email address. */
  people: Map<string, { userId: string; name: string; status: "active" | "pending" | "deactivated" | null }>;
  /** Existing group memberships, as `${groupId}:${userId}` → role. */
  memberships: Map<string, GroupRole>;
  /** Lower-case addresses with an invite waiting. */
  pendingInvites: Set<string>;
  /** Allowed email domains for joining; empty when any address can join. */
  allowedDomains: string[];
}

export interface PlannedPlacement {
  email: string;
  /** The group's id, or null for a group the import creates. */
  groupId: string | null;
  group: string;
  role: GroupRole;
}

export interface ImportPlan {
  /** Names of groups the import creates. */
  newGroups: string[];
  /** Active members going into a group, or becoming its lead. */
  add: (PlannedPlacement & { userId: string; name: string })[];
  /** Places saved for people who aren't active members yet. */
  save: (PlannedPlacement & { reason: "invite" | "invited" | "waiting" })[];
  /** Addresses to send a new invite to. */
  invite: string[];
  /** Rows already done: the person is in the group with that role. */
  alreadyDone: number;
  problems: { row: number; email: string; problem: string }[];
}

function parseRole(raw: unknown): GroupRole | null {
  if (raw === undefined || raw === null) return "member";
  const value = String(raw).trim().toLowerCase();
  if (value === "" || value === "member") return "member";
  if (value === "lead") return "lead";
  return null;
}

export function planGroupImport(rows: ImportRow[], ctx: ImportContext): ImportPlan {
  const plan: ImportPlan = { newGroups: [], add: [], save: [], invite: [], alreadyDone: 0, problems: [] };
  const groupsByName = new Map(ctx.groups.map((g) => [g.name.toLowerCase(), g]));
  const newGroupNames = new Map<string, string>();
  // One entry per person and group; a later row can make someone lead.
  const placements = new Map<string, PlannedPlacement>();

  rows.forEach((raw, i) => {
    const row = i + 1;
    const email = normaliseEmail(typeof raw.email === "string" ? raw.email : "");
    if (!EMAIL_PATTERN.test(email)) {
      plan.problems.push({ row, email, problem: email ? "Not an email address" : "No email address" });
      return;
    }
    const name = cleanGroupName(raw.group);
    if (!name) {
      const given = typeof raw.group === "string" && raw.group.trim();
      plan.problems.push({ row, email, problem: given ? "Group name is longer than 80 characters" : "No group" });
      return;
    }
    const role = parseRole(raw.role);
    if (!role) {
      plan.problems.push({ row, email, problem: "Role must be lead, member or left empty" });
      return;
    }
    const existing = groupsByName.get(name.toLowerCase());
    if (existing?.archived) {
      plan.problems.push({ row, email, problem: `${existing.name} is archived. Restore it first.` });
      return;
    }
    const person = ctx.people.get(email);
    if (person?.status === "deactivated") {
      plan.problems.push({ row, email, problem: "Deactivated. Reactivate them from Members first." });
      return;
    }
    if (person?.status !== "active" && person?.status !== "pending" && !ctx.pendingInvites.has(email)
      && ctx.allowedDomains.length > 0 && !emailMatchesDomains(email, ctx.allowedDomains)) {
      plan.problems.push({ row, email, problem: "Not one of your organisation's email domains" });
      return;
    }
    if (!existing && !newGroupNames.has(name.toLowerCase())) newGroupNames.set(name.toLowerCase(), name);
    const groupName = existing?.name ?? newGroupNames.get(name.toLowerCase())!;
    const key = `${email}\n${groupName.toLowerCase()}`;
    const earlier = placements.get(key);
    placements.set(key, {
      email,
      groupId: existing?.id ?? null,
      group: groupName,
      role: earlier?.role === "lead" ? "lead" : role,
    });
  });

  plan.newGroups = [...newGroupNames.values()];
  const invited = new Set<string>();
  for (const p of placements.values()) {
    const person = ctx.people.get(p.email);
    if (person?.status === "active") {
      const current = p.groupId ? ctx.memberships.get(`${p.groupId}:${person.userId}`) : undefined;
      if (current && (current === "lead" || p.role === "member")) {
        plan.alreadyDone++;
      } else {
        plan.add.push({ ...p, userId: person.userId, name: person.name });
      }
    } else if (person?.status === "pending") {
      plan.save.push({ ...p, reason: "waiting" });
    } else if (ctx.pendingInvites.has(p.email)) {
      plan.save.push({ ...p, reason: "invited" });
    } else {
      plan.save.push({ ...p, reason: "invite" });
      if (!invited.has(p.email)) {
        invited.add(p.email);
        plan.invite.push(p.email);
      }
    }
  }
  return plan;
}
