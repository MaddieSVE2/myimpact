import { formatCurrency } from "@/lib/utils";
import type { Badge } from "@/lib/badges";

const FONT_DISPLAY = "'Outfit', 'Inter', 'Helvetica Neue', Arial, sans-serif";
const FONT_BODY = "'Inter', 'Helvetica Neue', Arial, sans-serif";

async function ensureFontsReady(specs: string[]) {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s)));
    await document.fonts.ready;
  } catch {
    // ignore
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  weight: number | string = 700,
  family: string = FONT_DISPLAY,
) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// ─────────────────────────────────────────────────────────────────────────────
// Results page share card (replaces html2canvas of #impact-share-card)
// ─────────────────────────────────────────────────────────────────────────────

export interface ResultsShareCardData {
  totalValue: number;
  impactValue: number;
  contributionValue: number;
  donationsValue: number;
  personalDevelopmentValue: number;
  logoSrc?: string;
}

export async function paintResultsShareCard(
  data: ResultsShareCardData,
): Promise<HTMLCanvasElement> {
  await ensureFontsReady([
    "800 40px Outfit",
    "800 124px Outfit",
    "700 48px Outfit",
    "600 22px Outfit",
    "500 26px Outfit",
  ]);

  const scale = 2;
  const W = 600 * scale;
  const H = 460 * scale;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");
  ctx.scale(scale, scale);

  // Background gradient (160deg from #1b2b3a → #213547 → #1a2d40)
  // 160deg ≈ from top-left to bottom-right
  const grad = ctx.createLinearGradient(0, 0, 600, 460);
  grad.addColorStop(0, "#1b2b3a");
  grad.addColorStop(0.55, "#213547");
  grad.addColorStop(1, "#1a2d40");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 600, 460);

  // Header row
  const headerY = 64;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  // Wordmark — real logo image (preloaded as data URL so html2canvas/canvas
  // captures it reliably). Falls back to text lockup if image fails to load.
  const logoImg = data.logoSrc ? await loadImage(data.logoSrc) : null;
  if (logoImg && logoImg.naturalWidth > 0) {
    const logoH = 36;
    const logoW = (logoImg.naturalWidth / logoImg.naturalHeight) * logoH;
    ctx.drawImage(logoImg, 48, headerY - logoH / 2, logoW, logoH);
  } else {
    setFont(ctx, 22, 800, FONT_DISPLAY);
    const myW = ctx.measureText("My").width;
    ctx.fillStyle = "#E8633A";
    ctx.fillText("My", 48, headerY);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Impact", 48 + myW, headerY);
  }

  // Eyebrow right-aligned, with letter spacing
  setFont(ctx, 11, 600, FONT_DISPLAY);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  const eyebrow = "SOCIAL VALUE ENGINE";
  const eSpacing = 2;
  const eChars = Array.from(eyebrow);
  const eWidths = eChars.map((c) => ctx.measureText(c).width);
  const eTotalW = eWidths.reduce((a, b) => a + b, 0) + eSpacing * (eChars.length - 1);
  let ex = 600 - 48 - eTotalW;
  for (let i = 0; i < eChars.length; i++) {
    ctx.fillText(eChars[i], ex, headerY);
    ex += eWidths[i] + eSpacing;
  }

  // Section: "MY ANNUAL SOCIAL VALUE" eyebrow
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  setFont(ctx, 11, 600, FONT_DISPLAY);
  const ev = "MY ANNUAL SOCIAL VALUE";
  const evChars = Array.from(ev);
  const evWidths = evChars.map((c) => ctx.measureText(c).width);
  let evx = 48;
  for (let i = 0; i < evChars.length; i++) {
    ctx.fillText(evChars[i], evx, 130);
    evx += evWidths[i] + 1.5;
  }

  // Big total
  setFont(ctx, 62, 800, FONT_DISPLAY);
  ctx.fillStyle = "#E8633A";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText(formatCurrency(data.totalValue), 48, 200);

  // Subtitle
  setFont(ctx, 13, 400, FONT_DISPLAY);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("Total verified social impact", 48, 222);

  // Divider line
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(48, 264);
  ctx.lineTo(600 - 48, 264);
  ctx.stroke();

  // 2×2 grid of metrics
  const cells = [
    { label: "DIRECT IMPACT", value: data.impactValue, colour: "#E8633A" },
    { label: "CONTRIBUTIONS", value: data.contributionValue, colour: "#60a5fa" },
    { label: "DONATIONS", value: data.donationsValue, colour: "#4ade80" },
    { label: "PERSONAL DEV", value: data.personalDevelopmentValue, colour: "#fbbf24" },
  ];
  const gridLeft = 48;
  const gridRight = 600 - 48;
  const colW = (gridRight - gridLeft - 24) / 2;
  const rowH = 56;
  const gridTop = 296;
  cells.forEach((c, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = gridLeft + col * (colW + 24);
    const cy = gridTop + row * rowH;
    // label
    setFont(ctx, 9, 700, FONT_DISPLAY);
    ctx.fillStyle = c.colour;
    const labelChars = Array.from(c.label);
    const labelWidths = labelChars.map((ch) => ctx.measureText(ch).width);
    let lx = cx;
    ctx.textAlign = "left";
    for (let j = 0; j < labelChars.length; j++) {
      ctx.fillText(labelChars[j], lx, cy);
      lx += labelWidths[j] + 1.8;
    }
    // value
    setFont(ctx, 24, 700, FONT_DISPLAY);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(formatCurrency(c.value), cx, cy + 26);
  });

  // Footer
  setFont(ctx, 10, 500, FONT_DISPLAY);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  const footer = "myimpact.uk";
  const fChars = Array.from(footer);
  const fWidths = fChars.map((c) => ctx.measureText(c).width);
  let fx = 48;
  ctx.textAlign = "left";
  for (let i = 0; i < fChars.length; i++) {
    ctx.fillText(fChars[i], fx, 440);
    fx += fWidths[i] + 1.2;
  }

  return canvas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Milestone share card (replaces html2canvas of MilestoneShareCard)
// ─────────────────────────────────────────────────────────────────────────────

export type MilestoneShareFormat = "landscape" | "portrait";

export const MILESTONE_CARD_SIZES: Record<
  MilestoneShareFormat,
  { width: number; height: number }
> = {
  landscape: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1080 },
};

export interface MilestoneShareCardData {
  badge: Badge;
  totalValue: number;
  format: MilestoneShareFormat;
  appUrl: string;
  logoSrc?: string;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function paintMilestoneShareCard(
  data: MilestoneShareCardData,
): Promise<HTMLCanvasElement> {
  await ensureFontsReady([
    "800 88px Outfit",
    "800 52px Outfit",
    "700 44px Outfit",
    "500 24px Inter",
    "italic 16px Inter",
    "700 18px Outfit",
  ]);

  const { width, height } = MILESTONE_CARD_SIZES[data.format];
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");
  ctx.scale(scale, scale);

  const isLandscape = data.format === "landscape";
  const padding = isLandscape ? 56 : 80;
  const paddingH = isLandscape ? 72 : 80;

  // Background with rounded corners (24px radius)
  roundedRect(ctx, 0, 0, width, height, 24);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = "#f5f0e8";
  ctx.fillRect(0, 0, width, height);

  // Decorative accent circle top-right (CSS: top:-120, right:-120, w:400)
  const tl1 = isLandscape
    ? { x: width + 120 - 400, y: -120, w: 400, h: 400 }
    : { x: width + 150 - 500, y: -150, w: 500, h: 500 };
  ctx.fillStyle = "rgba(232, 98, 42, 0.08)";
  ctx.beginPath();
  ctx.arc(tl1.x + tl1.w / 2, tl1.y + tl1.h / 2, tl1.w / 2, 0, Math.PI * 2);
  ctx.fill();

  // Decorative accent circle bottom-left (CSS: bottom:-80, left:-80, w:300)
  const tl2 = isLandscape
    ? { x: -80, y: height + 80 - 300, w: 300, h: 300 }
    : { x: -100, y: height + 100 - 400, w: 400, h: 400 };
  ctx.fillStyle = "rgba(232, 98, 42, 0.06)";
  ctx.beginPath();
  ctx.arc(tl2.x + tl2.w / 2, tl2.y + tl2.h / 2, tl2.w / 2, 0, Math.PI * 2);
  ctx.fill();

  // Header height + footer height (matches MilestoneShareCard.tsx)
  const headerH = isLandscape ? 60 : 76;
  const footerH = isLandscape ? 40 : 56;

  // ── Header: logo block ────────────────────────────────────────────────────
  const headerY = padding;
  const logoBgPadX = isLandscape ? 12 : 14;
  const logoBgPadY = isLandscape ? 6 : 8;
  const logoH = isLandscape ? 32 : 40;

  let logoImg: HTMLImageElement | null = null;
  if (data.logoSrc) logoImg = await loadImage(data.logoSrc);

  let logoW = logoH * 3.2; // fallback aspect
  if (logoImg && logoImg.naturalWidth > 0) {
    logoW = (logoImg.naturalWidth / logoImg.naturalHeight) * logoH;
  }

  const logoBgW = logoW + logoBgPadX * 2;
  const logoBgH = logoH + logoBgPadY * 2;
  const logoBgX = paddingH;
  const logoBgY = headerY + (headerH - logoBgH) / 2;

  ctx.fillStyle = "#213547";
  roundedRect(ctx, logoBgX, logoBgY, logoBgW, logoBgH, 10);
  ctx.fill();

  if (logoImg && logoImg.naturalWidth > 0) {
    ctx.drawImage(
      logoImg,
      logoBgX + logoBgPadX,
      logoBgY + logoBgPadY,
      logoW,
      logoH,
    );
  } else {
    setFont(ctx, logoH * 0.55, 800, FONT_DISPLAY);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("My Impact", logoBgX + logoBgPadX, logoBgY + logoBgH / 2);
  }

  // ── Centre: milestone block ───────────────────────────────────────────────
  const centreTop = padding + headerH;
  const centreBottom = height - padding - footerH;
  const centreH = centreBottom - centreTop;
  const centreCx = width / 2;

  const circleSize = isLandscape ? 140 : 180;
  const emojiSize = isLandscape ? 64 : 80;
  const nameSize = isLandscape ? 44 : 52;
  const descSize = isLandscape ? 20 : 24;
  const valueSize = isLandscape ? 36 : 44;
  const valueLabelSize = isLandscape ? 14 : 17;
  const valuePadX = isLandscape ? 40 : 48;
  const valuePadY = isLandscape ? 16 : 20;
  const gap = isLandscape ? 20 : 28;

  // Wrap description
  setFont(ctx, descSize, 400, FONT_BODY);
  const descMaxWidth = isLandscape ? 700 : 800;
  const descLines = wrapLines(ctx, data.badge.description, descMaxWidth);
  const descLineH = descSize * 1.4;
  const descBlockH = descLines.length * descLineH;

  const nameBlockH = nameSize * 1.1;
  const nameDescGap = 12;

  // Value pill dimensions
  setFont(ctx, valueSize, 800, FONT_DISPLAY);
  const valueText = formatCurrency(data.totalValue);
  const valueW = ctx.measureText(valueText).width;
  setFont(ctx, valueLabelSize, 500, FONT_BODY);
  const labelW = ctx.measureText("of social value created").width;
  const pillContentW = Math.max(valueW, labelW);
  const pillW = pillContentW + valuePadX * 2;
  const pillContentH = valueSize + 4 + valueLabelSize;
  const pillH = pillContentH + valuePadY * 2;

  // Total block height
  const totalH =
    circleSize + gap + nameBlockH + nameDescGap + descBlockH + gap + pillH;
  let cy = centreTop + (centreH - totalH) / 2;

  // Circle
  const circleCy = cy + circleSize / 2;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(26,46,58,0.12)";
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 8;
  ctx.beginPath();
  ctx.arc(centreCx, circleCy, circleSize / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border ring
  ctx.strokeStyle = data.badge.colour;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centreCx, circleCy, circleSize / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();

  // Emoji
  setFont(ctx, emojiSize, 400, FONT_BODY);
  ctx.fillStyle = "#1a2e3a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(data.badge.emoji, centreCx, circleCy + 2);

  cy += circleSize + gap;

  // Name
  setFont(ctx, nameSize, 800, FONT_DISPLAY);
  ctx.fillStyle = "#1a2e3a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(data.badge.name, centreCx, cy + nameBlockH / 2);
  cy += nameBlockH + nameDescGap;

  // Description
  setFont(ctx, descSize, 400, FONT_BODY);
  ctx.fillStyle = "#4a6070";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < descLines.length; i++) {
    ctx.fillText(descLines[i], centreCx, cy + descLineH / 2 + i * descLineH);
  }
  cy += descBlockH + gap;

  // Pill
  const pillX = centreCx - pillW / 2;
  ctx.fillStyle = "#e8622a";
  roundedRect(ctx, pillX, cy, pillW, pillH, 16);
  ctx.fill();

  setFont(ctx, valueSize, 800, FONT_DISPLAY);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(valueText, centreCx, cy + valuePadY + valueSize / 2);

  setFont(ctx, valueLabelSize, 500, FONT_BODY);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(
    "of social value created",
    centreCx,
    cy + valuePadY + valueSize + 4 + valueLabelSize / 2,
  );

  // ── Footer ────────────────────────────────────────────────────────────────
  const footerY = height - padding - footerH;
  if (isLandscape) {
    setFont(ctx, 13, 400, `italic ${FONT_BODY}`);
    ctx.font = `italic 400 13px ${FONT_BODY}`;
    ctx.fillStyle = "#7a9aaa";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const noteLines = wrapLines(
      ctx,
      "Calculated using globally recognised social value standards",
      460,
    );
    let ny = height - padding;
    for (let i = noteLines.length - 1; i >= 0; i--) {
      ctx.fillText(noteLines[i], paddingH, ny);
      ny -= 18;
    }
    ctx.font = `700 15px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#e8622a";
    ctx.textAlign = "right";
    ctx.fillText("myimpact.uk", width - paddingH, height - padding);
  } else {
    ctx.font = `italic 400 16px ${FONT_BODY}`;
    ctx.fillStyle = "#7a9aaa";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const noteLines = wrapLines(
      ctx,
      "Calculated using globally recognised social value standards",
      width - paddingH * 2,
    );
    let ny = footerY;
    for (let i = 0; i < noteLines.length; i++) {
      ctx.fillText(noteLines[i], paddingH, ny);
      ny += 22;
    }
    ctx.font = `700 18px ${FONT_DISPLAY}`;
    ctx.fillStyle = "#e8622a";
    ctx.fillText("myimpact.uk", paddingH, ny + 4);
  }

  ctx.restore();
  return canvas;
}
