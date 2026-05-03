import { formatCurrency, formatNumber } from "@/lib/utils";

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const SCENE_DURATION = 2.4;
export const CROSSFADE = 0.4;
export const FPS = 30;

const COLOR_BG = "#1a2e3a";
const COLOR_ORANGE = "#e8622a";
const COLOR_WHITE = "#ffffff";
const FONT_DISPLAY = "'Outfit', 'Inter', sans-serif";
const FONT_SERIF = "'Fraunces', 'Outfit', serif";

export interface RecapVideoData {
  year: number;
  displayName: string | null;
  showMoney: boolean;
  totalValue: number;
  totalHours: number;
  recordCount: number;
  topSdg: { name: string; color: string } | null;
  topActivity: { name: string; hours: number; value: number; category: string } | null;
  biggestRecord: {
    title: string;
    dateLabel: string;
    totalValue: number;
    totalHours: number;
  } | null;
  appUrl: string;
  logoImage: HTMLImageElement | null;
}

export interface RecapVideoOptions {
  onProgress?: (progress: number) => void;
}

export interface RecapVideoResult {
  blob: Blob;
  mimeType: string;
  extension: "mp4" | "webm";
}

export function isVideoExportSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof MediaRecorder === "undefined") return false;
  if (typeof HTMLCanvasElement === "undefined") return false;
  if (typeof HTMLCanvasElement.prototype.captureStream !== "function") return false;
  return pickMimeType() !== null;
}

function pickMimeType(): { mimeType: string; extension: "mp4" | "webm" } | null {
  const candidates: Array<{ mimeType: string; extension: "mp4" | "webm" }> = [
    { mimeType: "video/mp4;codecs=avc1", extension: "mp4" },
    { mimeType: "video/mp4", extension: "mp4" },
    { mimeType: "video/webm;codecs=vp9", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

function buildScenes(data: RecapVideoData): Scene[] {
  const scenes: Scene[] = [];
  scenes.push(introScene(data));
  scenes.push(headlineScene(data));
  if (data.topSdg) scenes.push(sdgScene(data, data.topSdg));
  if (data.topActivity) scenes.push(activityScene(data, data.topActivity));
  if (data.biggestRecord) scenes.push(biggestScene(data, data.biggestRecord));
  scenes.push(outroScene(data));
  return scenes;
}

interface Scene {
  paint(ctx: CanvasRenderingContext2D, alpha: number, localT: number): void;
}

function easeOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function withFade(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  localT: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  const slide = (1 - easeOut(Math.min(1, localT / 0.6))) * 36;
  ctx.translate(0, slide);
  draw(ctx);
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  // top-right orange blob, slowly drifting
  const cx1 = 880 + Math.sin(t * 0.35) * 60;
  const cy1 = 240 + Math.cos(t * 0.4) * 40;
  const grad1 = ctx.createRadialGradient(cx1, cy1, 0, cx1, cy1, 760);
  grad1.addColorStop(0, "rgba(232,98,42,0.55)");
  grad1.addColorStop(1, "rgba(232,98,42,0)");
  ctx.fillStyle = grad1;
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);

  // bottom-left teal blob
  const cx2 = 180 + Math.cos(t * 0.3) * 60;
  const cy2 = 1700 + Math.sin(t * 0.45) * 40;
  const grad2 = ctx.createRadialGradient(cx2, cy2, 0, cx2, cy2, 640);
  grad2.addColorStop(0, "rgba(86,160,180,0.45)");
  grad2.addColorStop(1, "rgba(86,160,180,0)");
  ctx.fillStyle = grad2;
  ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
}

function setFont(
  ctx: CanvasRenderingContext2D,
  size: number,
  weight: number | string = 700,
  family: string = FONT_DISPLAY,
  italic: boolean = false,
) {
  const style = italic ? "italic " : "";
  ctx.font = `${style}${weight} ${size}px ${family}`;
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

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight: number | string,
  family: string,
): number {
  let size = startSize;
  while (size > minSize) {
    setFont(ctx, size, weight, family);
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 4;
  }
  return minSize;
}

function drawCenteredLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  centerX: number,
  centerY: number,
  lineHeight: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const totalH = lines.length * lineHeight;
  const startY = centerY - totalH / 2 + lineHeight / 2;
  lines.forEach((line, i) => {
    ctx.fillText(line, centerX, startY + i * lineHeight);
  });
}

function drawEyebrow(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  color: string = "rgba(255,255,255,0.55)",
) {
  setFont(ctx, 38, 800);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  // letter-spacing emulation
  const spacing = 6;
  const upper = text.toUpperCase();
  let totalWidth = 0;
  const widths: number[] = [];
  for (const ch of upper) {
    const w = ctx.measureText(ch).width;
    widths.push(w);
    totalWidth += w;
  }
  totalWidth += spacing * (upper.length - 1);
  let x = centerX - totalWidth / 2;
  for (let i = 0; i < upper.length; i++) {
    ctx.fillText(upper[i], x + widths[i] / 2, y);
    x += widths[i] + spacing;
  }
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  topY: number,
  maxWidth: number,
) {
  setFont(ctx, 44, 500);
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const lines = wrapLines(ctx, text, maxWidth);
  const lineHeight = 60;
  lines.forEach((line, i) => {
    ctx.fillText(line, centerX, topY + i * lineHeight);
  });
  return topY + lines.length * lineHeight;
}

function introScene(data: RecapVideoData): Scene {
  const firstName = data.displayName?.trim().split(/\s+/)[0] ?? null;
  const heading = firstName ? `${firstName}, here's` : "Here's";
  return {
    paint(ctx, alpha, localT) {
      withFade(ctx, alpha, localT, (ctx) => {
        drawEyebrow(ctx, `${data.year} · Year in impact`, VIDEO_WIDTH / 2, 720, COLOR_ORANGE);

        setFont(ctx, 140, 900, FONT_SERIF);
        ctx.fillStyle = COLOR_WHITE;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(heading, VIDEO_WIDTH / 2, 880);

        setFont(ctx, 140, 900, FONT_SERIF, true);
        ctx.fillStyle = COLOR_ORANGE;
        ctx.fillText("your year.", VIDEO_WIDTH / 2, 1050);

        drawCaption(
          ctx,
          `${data.recordCount} record${data.recordCount === 1 ? "" : "s"}, ${formatNumber(
            data.totalHours,
          )} hours, and a whole lot of difference.`,
          VIDEO_WIDTH / 2,
          1200,
          860,
        );
      });
    },
  };
}

function headlineScene(data: RecapVideoData): Scene {
  return {
    paint(ctx, alpha, localT) {
      withFade(ctx, alpha, localT, (ctx) => {
        if (data.showMoney) {
          drawEyebrow(ctx, "Total social value", VIDEO_WIDTH / 2, 760);

          const text = formatCurrency(data.totalValue);
          const size = fitFontSize(ctx, text, 940, 280, 140, 900, FONT_DISPLAY);
          setFont(ctx, size, 900, FONT_DISPLAY);
          ctx.fillStyle = COLOR_ORANGE;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(text, VIDEO_WIDTH / 2, 990);

          drawCaption(
            ctx,
            `Across ${formatNumber(data.totalHours)} hours of work that mattered in ${data.year}.`,
            VIDEO_WIDTH / 2,
            1200,
            860,
          );
        } else {
          drawEyebrow(ctx, "Hours given", VIDEO_WIDTH / 2, 760);

          const num = formatNumber(data.totalHours);
          setFont(ctx, 280, 900, FONT_DISPLAY);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const numWidth = ctx.measureText(num).width;
          setFont(ctx, 120, 700, FONT_DISPLAY);
          const hrsWidth = ctx.measureText(" hrs").width;
          const total = numWidth + hrsWidth;
          let cursor = VIDEO_WIDTH / 2 - total / 2;
          setFont(ctx, 280, 900, FONT_DISPLAY);
          ctx.fillStyle = COLOR_WHITE;
          ctx.textAlign = "left";
          ctx.fillText(num, cursor, 990);
          cursor += numWidth;
          setFont(ctx, 120, 700, FONT_DISPLAY);
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fillText(" hrs", cursor, 990);
          ctx.textAlign = "center";
          drawCaption(
            ctx,
            data.totalHours >= 100
              ? "An extraordinary amount of time given to others."
              : "Every hour adds up. Yours did this year.",
            VIDEO_WIDTH / 2,
            1200,
            860,
          );
        }
      });
    },
  };
}

function sdgScene(data: RecapVideoData, sdg: { name: string; color: string }): Scene {
  return {
    paint(ctx, alpha, localT) {
      withFade(ctx, alpha, localT, (ctx) => {
        drawEyebrow(ctx, "Your top UN goal", VIDEO_WIDTH / 2, 720);

        // Wrap and size SDG name
        let size = 130;
        let lines: string[] = [];
        while (size > 60) {
          setFont(ctx, size, 900, FONT_DISPLAY);
          lines = wrapLines(ctx, sdg.name, 940);
          if (lines.length <= 3) break;
          size -= 6;
        }
        setFont(ctx, size, 900, FONT_DISPLAY);
        const lineHeight = size * 1.05;
        drawCenteredLines(ctx, lines, VIDEO_WIDTH / 2, 1000, lineHeight, sdg.color);

        drawCaption(
          ctx,
          data.showMoney && data.topSdg
            ? `The goal you contributed to most this year.`
            : `This was the goal you contributed to most.`,
          VIDEO_WIDTH / 2,
          1280,
          860,
        );
      });
    },
  };
}

function activityScene(
  data: RecapVideoData,
  a: { name: string; hours: number; value: number; category: string },
): Scene {
  return {
    paint(ctx, alpha, localT) {
      withFade(ctx, alpha, localT, (ctx) => {
        drawEyebrow(ctx, "Your standout activity", VIDEO_WIDTH / 2, 720);

        let size = 120;
        let lines: string[] = [];
        while (size > 56) {
          setFont(ctx, size, 900, FONT_DISPLAY);
          lines = wrapLines(ctx, a.name, 940);
          if (lines.length <= 3) break;
          size -= 6;
        }
        setFont(ctx, size, 900, FONT_DISPLAY);
        drawCenteredLines(ctx, lines, VIDEO_WIDTH / 2, 1000, size * 1.1, COLOR_WHITE);

        const caption = data.showMoney
          ? `${formatCurrency(a.value)} of value · ${formatNumber(a.hours)} hours`
          : `${formatNumber(a.hours)} hours in ${a.category.toLowerCase()}`;
        setFont(ctx, 50, 700);
        ctx.fillStyle = COLOR_ORANGE;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(caption, VIDEO_WIDTH / 2, 1320);
      });
    },
  };
}

function biggestScene(
  data: RecapVideoData,
  b: { title: string; dateLabel: string; totalValue: number; totalHours: number },
): Scene {
  return {
    paint(ctx, alpha, localT) {
      withFade(ctx, alpha, localT, (ctx) => {
        drawEyebrow(ctx, "Biggest single record", VIDEO_WIDTH / 2, 700);

        let size = 90;
        let lines: string[] = [];
        while (size > 48) {
          setFont(ctx, size, 800, FONT_DISPLAY);
          lines = wrapLines(ctx, b.title, 940);
          if (lines.length <= 3) break;
          size -= 4;
        }
        setFont(ctx, size, 800, FONT_DISPLAY);
        drawCenteredLines(ctx, lines, VIDEO_WIDTH / 2, 880, size * 1.15, COLOR_WHITE);

        setFont(ctx, 36, 600);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(b.dateLabel, VIDEO_WIDTH / 2, 1080);

        if (data.showMoney) {
          const text = formatCurrency(b.totalValue);
          const fs = fitFontSize(ctx, text, 940, 220, 120, 900, FONT_DISPLAY);
          setFont(ctx, fs, 900, FONT_DISPLAY);
          ctx.fillStyle = COLOR_ORANGE;
          ctx.fillText(text, VIDEO_WIDTH / 2, 1280);
        } else {
          const num = formatNumber(b.totalHours);
          setFont(ctx, 220, 900, FONT_DISPLAY);
          const numWidth = ctx.measureText(num).width;
          setFont(ctx, 100, 700, FONT_DISPLAY);
          const hrsWidth = ctx.measureText(" hrs").width;
          const total = numWidth + hrsWidth;
          let cursor = VIDEO_WIDTH / 2 - total / 2;
          setFont(ctx, 220, 900, FONT_DISPLAY);
          ctx.fillStyle = COLOR_WHITE;
          ctx.textAlign = "left";
          ctx.fillText(num, cursor, 1280);
          cursor += numWidth;
          setFont(ctx, 100, 700, FONT_DISPLAY);
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fillText(" hrs", cursor, 1280);
        }
      });
    },
  };
}

function outroScene(data: RecapVideoData): Scene {
  return {
    paint(ctx, alpha, localT) {
      withFade(ctx, alpha, localT, (ctx) => {
        drawEyebrow(ctx, "Powered by", VIDEO_WIDTH / 2, 820);

        if (data.logoImage && data.logoImage.complete && data.logoImage.naturalWidth > 0) {
          const targetW = 520;
          const ratio = data.logoImage.naturalHeight / data.logoImage.naturalWidth;
          const targetH = targetW * ratio;
          ctx.drawImage(
            data.logoImage,
            VIDEO_WIDTH / 2 - targetW / 2,
            960 - targetH / 2,
            targetW,
            targetH,
          );
        } else {
          setFont(ctx, 130, 900, FONT_DISPLAY);
          ctx.fillStyle = COLOR_WHITE;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("My Impact", VIDEO_WIDTH / 2, 960);
        }

        setFont(ctx, 56, 800, FONT_DISPLAY);
        ctx.fillStyle = COLOR_ORANGE;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(data.appUrl, VIDEO_WIDTH / 2, 1180);

        drawCaption(
          ctx,
          `Track your impact in hours and pounds. Share your year.`,
          VIDEO_WIDTH / 2,
          1300,
          860,
        );
      });
    },
  };
}

interface SceneTimeline {
  scenes: Scene[];
  starts: number[];
  totalDuration: number;
}

function buildTimeline(scenes: Scene[]): SceneTimeline {
  const step = SCENE_DURATION - CROSSFADE;
  const starts = scenes.map((_, i) => i * step);
  const totalDuration = (scenes.length - 1) * step + SCENE_DURATION;
  return { scenes, starts, totalDuration };
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  timeline: SceneTimeline,
  t: number,
) {
  drawBackground(ctx, t);
  for (let i = 0; i < timeline.scenes.length; i++) {
    const start = timeline.starts[i];
    const end = start + SCENE_DURATION;
    if (t < start || t > end) continue;
    const localT = t - start;
    let alpha = 1;
    if (localT < CROSSFADE) {
      alpha = localT / CROSSFADE;
    } else if (end - t < CROSSFADE && i < timeline.scenes.length - 1) {
      alpha = (end - t) / CROSSFADE;
    }
    timeline.scenes[i].paint(ctx, alpha, localT);
  }
}

async function ensureFontsReady() {
  if (typeof document === "undefined") return;
  const fonts = document.fonts;
  if (!fonts) return;
  try {
    // Pre-load a few common sizes to nudge the browser
    await Promise.all([
      fonts.load("900 200px Outfit"),
      fonts.load("900 140px Fraunces"),
      fonts.load("700 60px Outfit"),
      fonts.load("800 38px Outfit"),
    ]);
    await fonts.ready;
  } catch {
    // ignore
  }
}

export async function buildRecapPoster(data: RecapVideoData): Promise<Blob> {
  await ensureFontsReady();

  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");

  drawBackground(ctx, 0);
  outroScene(data).paint(ctx, 1, 1);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to generate poster image"));
      },
      "image/jpeg",
      0.92,
    );
  });
}

export async function buildRecapVideo(
  data: RecapVideoData,
  options: RecapVideoOptions = {},
): Promise<RecapVideoResult> {
  const mime = pickMimeType();
  if (!mime) throw new Error("MediaRecorder not supported in this browser");

  await ensureFontsReady();

  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D canvas context");

  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime.mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const scenes = buildScenes(data);
  const timeline = buildTimeline(scenes);

  // Paint a first frame before starting the recorder to avoid a black flash
  paintFrame(ctx, timeline, 0);

  recorder.start();

  const result = await new Promise<RecapVideoResult>((resolve, reject) => {
    recorder.onerror = (e: Event) => {
      const err = (e as ErrorEvent).error;
      reject(err instanceof Error ? err : new Error("MediaRecorder error"));
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mime.mimeType });
      resolve({ blob, mimeType: mime.mimeType, extension: mime.extension });
    };

    const startWall = performance.now();
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const elapsed = (performance.now() - startWall) / 1000;
      const t = Math.min(elapsed, timeline.totalDuration);
      paintFrame(ctx, timeline, t);
      const progress = Math.min(1, t / timeline.totalDuration);
      try {
        options.onProgress?.(progress);
      } catch {
        // ignore listener errors
      }
      if (elapsed >= timeline.totalDuration) {
        stopped = true;
        // Hold last frame briefly so the final frame is captured cleanly
        setTimeout(() => {
          try {
            recorder.stop();
          } catch (err) {
            reject(err);
          }
        }, 250);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  return result;
}
