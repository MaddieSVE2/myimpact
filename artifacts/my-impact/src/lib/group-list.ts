/**
 * Reads a list of people and groups from a CSV file or rows pasted from a
 * spreadsheet (tab-separated): one row per person and group, with columns
 * Email, Group and an optional Role. The server checks each row
 * (artifacts/api-server/src/lib/groupImport.ts).
 */

export const MAX_LIST_ROWS = 1000;

export interface GroupListRow {
  email: string;
  group: string;
  role: string;
  /** The row's line in the file, for pointing at problems. */
  line: number;
}

export type ParsedGroupList = { ok: true; rows: GroupListRow[] } | { ok: false; error: string };

const EMAIL_HEADERS = ["email", "email address", "e-mail", "e-mail address"];
const GROUP_HEADERS = ["group", "group name", "team", "club"];
const ROLE_HEADERS = ["role", "group role"];

/** Splits one line into cells. Quoted cells may hold the delimiter, and "" is a quote mark. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

function delimiterOf(line: string): string {
  if (line.includes("\t")) return "\t";
  // Spreadsheets set to some European languages save CSV with semicolons.
  if (line.includes(";") && !line.includes(",")) return ";";
  return ",";
}

export function parseGroupList(text: string): ParsedGroupList {
  // Spreadsheets often start a CSV file with a byte order mark.
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
    .split(/\r?\n/)
    .map((content, i) => ({ content, line: i + 1 }))
    .filter((l) => l.content.trim() !== "");
  if (lines.length === 0) return { ok: false, error: "The list is empty." };

  const delimiter = delimiterOf(lines[0]!.content);
  const first = splitLine(lines[0]!.content, delimiter).map((c) => c.toLowerCase());
  let emailCol = 0;
  let groupCol = 1;
  let roleCol = 2;
  let body = lines;
  const headerEmail = first.findIndex((c) => EMAIL_HEADERS.includes(c));
  if (headerEmail >= 0) {
    emailCol = headerEmail;
    groupCol = first.findIndex((c) => GROUP_HEADERS.includes(c));
    roleCol = first.findIndex((c) => ROLE_HEADERS.includes(c));
    if (groupCol < 0) return { ok: false, error: "Add a column called Group." };
    body = lines.slice(1);
  } else if (!first[0]?.includes("@")) {
    return { ok: false, error: "Start with a header row of Email and Group, or put email addresses in the first column." };
  }

  if (body.length === 0) return { ok: false, error: "The list has a header row and nothing under it." };
  if (body.length > MAX_LIST_ROWS) {
    return { ok: false, error: `The list has ${body.length.toLocaleString("en-GB")} rows. Add up to ${MAX_LIST_ROWS.toLocaleString("en-GB")} at a time.` };
  }
  return {
    ok: true,
    rows: body.map((l) => {
      const cells = splitLine(l.content, delimiter);
      return {
        email: cells[emailCol] ?? "",
        group: cells[groupCol] ?? "",
        role: roleCol >= 0 ? (cells[roleCol] ?? "") : "",
        line: l.line,
      };
    }),
  };
}
