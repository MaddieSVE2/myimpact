import { describe, it, expect } from "vitest";
import { parseGroupList, MAX_LIST_ROWS } from "./group-list";

describe("parseGroupList", () => {
  it("reads a CSV with a header row, in any column order", () => {
    const parsed = parseGroupList("Group,Name,Email,Role\nFootball club,Sam,sam@example.org,lead\nNetball,Jo,jo@example.org,\n");
    expect(parsed).toEqual({
      ok: true,
      rows: [
        { email: "sam@example.org", group: "Football club", role: "lead", line: 2 },
        { email: "jo@example.org", group: "Netball", role: "", line: 3 },
      ],
    });
  });

  it("reads rows pasted from a spreadsheet without a header", () => {
    const parsed = parseGroupList("sam@example.org\tFootball club\r\njo@example.org\tNetball\tmember");
    expect(parsed.ok && parsed.rows.map((r) => [r.email, r.group, r.role])).toEqual([
      ["sam@example.org", "Football club", ""],
      ["jo@example.org", "Netball", "member"],
    ]);
  });

  it("keeps commas inside quoted cells and reads semicolon files", () => {
    const quoted = parseGroupList('email,group\nsam@example.org,"Under 12s, Saturday"');
    expect(quoted.ok && quoted.rows[0]!.group).toBe("Under 12s, Saturday");
    const semicolons = parseGroupList("E-mail;Team\nsam@example.org;Football club");
    expect(semicolons.ok && semicolons.rows[0]).toMatchObject({ email: "sam@example.org", group: "Football club" });
  });

  it("skips blank lines and a byte order mark, and keeps line numbers", () => {
    const parsed = parseGroupList(String.fromCharCode(0xfeff) + "Email,Group\n\nsam@example.org,Football club\n");
    expect(parsed.ok && parsed.rows).toEqual([{ email: "sam@example.org", group: "Football club", role: "", line: 3 }]);
  });

  it("explains lists it can't read", () => {
    expect(parseGroupList("  \n")).toEqual({ ok: false, error: "The list is empty." });
    expect(parseGroupList("Email,Name\nsam@example.org,Sam")).toEqual({ ok: false, error: "Add a column called Group." });
    expect(parseGroupList("Name,Club\nSam,Football").ok).toBe(false);
    expect(parseGroupList("Email,Group\n").ok).toBe(false);
    const tooLong = ["Email,Group", ...Array.from({ length: MAX_LIST_ROWS + 1 }, (_, i) => `p${i}@example.org,Club`)].join("\n");
    expect(parseGroupList(tooLong)).toEqual({ ok: false, error: "The list has 1,001 rows. Add up to 1,000 at a time." });
  });
});
