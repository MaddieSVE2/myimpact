import type { MonthlyDigestPayload } from "./digestData.js";

function escapeHtml(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(n: number): string {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtHours(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded.toLocaleString("en-GB")} ${rounded === 1 ? "hour" : "hours"}`;
}

export interface BuildDigestEmailInput {
  payload: MonthlyDigestPayload;
  appUrl: string;
  unsubscribeUrl: string;
  greetingName: string;
}

export function buildDigestSubject(payload: MonthlyDigestPayload): string {
  return `Your ${payload.monthLabel} impact recap`;
}

/**
 * Render the My Impact monthly digest email. Uses inline styles only —
 * email clients drop <style> blocks. Brand colour is #F06127 (matches
 * the magic-link email already sent from this app).
 */
export function buildDigestEmail({
  payload,
  appUrl,
  unsubscribeUrl,
  greetingName,
}: BuildDigestEmailInput): string {
  const wizardUrl = `${appUrl}/wizard/actions`;

  const milestonesBlock = payload.newMilestones.length
    ? `
      <p style="margin:24px 0 8px;color:#213547;font-size:15px;font-weight:600;">New milestones this month</p>
      <ul style="margin:0 0 16px;padding:0 0 0 20px;color:#444;font-size:14px;line-height:1.6;">
        ${payload.newMilestones
          .map(
            (m) =>
              `<li><strong>${escapeHtml(m.emoji)} ${escapeHtml(m.name)}</strong> — ${escapeHtml(m.description)}</li>`,
          )
          .join("")}
      </ul>`
    : "";

  const journalBlock = payload.journalHighlight
    ? `
      <div style="margin:24px 0 0;padding:16px 18px;background:#fff7f0;border-left:4px solid #F06127;border-radius:6px;">
        <p style="margin:0 0 6px;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">From your journal${
          payload.journalHighlight.periodLabel
            ? ` · ${escapeHtml(payload.journalHighlight.periodLabel)}`
            : ""
        }</p>
        <p style="margin:0;color:#213547;font-size:14px;line-height:1.6;font-style:italic;">${escapeHtml(payload.journalHighlight.reflection)}</p>
      </div>`
    : "";

  const topActivityRow = payload.topActivity
    ? `<tr><td style="padding:6px 14px 6px 0;color:#666;font-size:13px;">Top activity</td><td style="font-size:14px;color:#213547;">${escapeHtml(payload.topActivity.name)}</td></tr>`
    : "";
  const topSdgRow = payload.topSdg
    ? `<tr><td style="padding:6px 14px 6px 0;color:#666;font-size:13px;">Top SDG</td><td style="font-size:14px;color:#213547;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${escapeHtml(payload.topSdg.color)};margin-right:6px;vertical-align:middle;"></span>${escapeHtml(payload.topSdg.name)}</td></tr>`
    : "";

  const hoursDisplay = payload.totals.totalHours > 0 ? fmtHours(payload.totals.totalHours) : "—";

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;">
      <img src="${escapeHtml(appUrl)}/images/myimpact.png" alt="My Impact" style="height:44px;margin-bottom:24px;" />
      <h1 style="margin:0 0 6px;color:#213547;font-size:22px;font-weight:700;">Your ${escapeHtml(payload.monthLabel)} recap</h1>
      <p style="margin:0 0 20px;color:#555;font-size:14px;line-height:1.6;">
        Hi ${escapeHtml(greetingName)} — here's a summary of the difference you made last month.
      </p>

      <div style="background:#fff7f0;border:1px solid #f5d2bc;border-radius:12px;padding:18px 20px;margin:0 0 20px;">
        <p style="margin:0 0 4px;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;font-weight:600;">Social value created</p>
        <p style="margin:0;color:#F06127;font-size:30px;font-weight:800;line-height:1.1;">${fmtMoney(payload.totals.totalValue)}</p>
        <p style="margin:8px 0 0;color:#666;font-size:13px;">
          Across ${payload.totals.recordCount} ${payload.totals.recordCount === 1 ? "record" : "records"} · ${hoursDisplay}
        </p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin:0 0 8px;">
        ${topActivityRow}
        ${topSdgRow}
        <tr><td style="padding:6px 14px 6px 0;color:#666;font-size:13px;">Donations logged</td><td style="font-size:14px;color:#213547;">${fmtMoney(payload.totals.donationsValue)}</td></tr>
        <tr><td style="padding:6px 14px 6px 0;color:#666;font-size:13px;">All-time total</td><td style="font-size:14px;color:#213547;">${fmtMoney(payload.cumulative.totalValue)} across ${payload.cumulative.recordCount} ${payload.cumulative.recordCount === 1 ? "record" : "records"}</td></tr>
      </table>

      ${milestonesBlock}
      ${journalBlock}

      <div style="margin:32px 0 8px;text-align:center;">
        <a href="${escapeHtml(wizardUrl)}" style="display:inline-block;background:#F06127;color:#ffffff;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;">
          Log this month →
        </a>
      </div>
      <p style="margin:6px 0 0;color:#999;font-size:12px;text-align:center;">
        Takes a couple of minutes. We'll round up your next recap on the 1st.
      </p>

      <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;" />
      <p style="margin:0;color:#aaa;font-size:11px;line-height:1.6;text-align:center;">
        You're receiving this because you opted in to monthly recaps from My Impact.<br />
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#888;">Unsubscribe in one click</a> · <a href="${escapeHtml(appUrl)}/settings" style="color:#888;">Manage email preferences</a>
      </p>
    </div>
  `;
}

/**
 * Plain-text fallback for clients that block HTML.
 */
export function buildDigestPlainText({
  payload,
  appUrl,
  unsubscribeUrl,
  greetingName,
}: BuildDigestEmailInput): string {
  const lines: string[] = [];
  lines.push(`Your ${payload.monthLabel} recap`);
  lines.push("");
  lines.push(`Hi ${greetingName} — here's a summary of last month.`);
  lines.push("");
  lines.push(`Social value created: ${fmtMoney(payload.totals.totalValue)}`);
  lines.push(
    `Records: ${payload.totals.recordCount} · Hours: ${
      payload.totals.totalHours > 0 ? fmtHours(payload.totals.totalHours) : "—"
    }`,
  );
  if (payload.topActivity) {
    lines.push(`Top activity: ${payload.topActivity.name}`);
  }
  if (payload.topSdg) {
    lines.push(`Top SDG: ${payload.topSdg.name}`);
  }
  lines.push(`Donations logged: ${fmtMoney(payload.totals.donationsValue)}`);
  lines.push(
    `All-time total: ${fmtMoney(payload.cumulative.totalValue)} across ${payload.cumulative.recordCount} record(s)`,
  );
  if (payload.newMilestones.length) {
    lines.push("");
    lines.push("New milestones:");
    for (const m of payload.newMilestones) {
      lines.push(`  • ${m.name} — ${m.description}`);
    }
  }
  if (payload.journalHighlight) {
    lines.push("");
    lines.push("From your journal:");
    lines.push(`  "${payload.journalHighlight.reflection}"`);
  }
  lines.push("");
  lines.push(`Log this month: ${appUrl}/wizard/actions`);
  lines.push("");
  lines.push(`Unsubscribe in one click: ${unsubscribeUrl}`);
  lines.push(`Manage preferences: ${appUrl}/settings`);
  return lines.join("\n");
}
