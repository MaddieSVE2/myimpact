import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Loader2, ArrowRight, Image as ImageIcon, RefreshCw, Sparkles, Check, Bookmark } from "lucide-react";
import {
  useListRecurringTemplates,
  getListRecurringTemplatesQueryKey,
  type RecurringTemplate,
  type SelectedActivity,
  type CustomActivityInput,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { describeCadence } from "@/components/QuickLog";
import { NumberInput } from "@/components/ui/number-input";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Stage = "camera" | "preview" | "details" | "saving" | "done";

const SAVED_DESCRIPTIONS_KEY = "my-impact-photo-activity-descriptions";

interface CalculateResponse {
  totalValue: number;
  impactValue: number;
  contributionValue: number;
  donationsValue: number;
  personalDevelopmentValue: number;
  totalHours: number;
  hoursPerActivity?: Record<string, number>;
}

interface ProxyMatch {
  title: string;
  proxyYear: string;
  valuePerUnit: number;
  unit: string;
}

interface AnalysedActivity {
  friendlyQuestion: string;
  unit: string;
  unitLabel: string;
  defaultQuantity: number;
  sdgHint: string;
  proxyMatch: ProxyMatch | null;
}

function sdgFromHint(hint: string): { sdg: string; sdgColor: string } {
  const match = hint.match(/SDG\s*(\d+)[:\s]+(.+)/i);
  const colours: Record<number, string> = {
    1: "#E5243B", 2: "#DDA63A", 3: "#4C9F38", 4: "#C5192D", 5: "#FF3A21",
    6: "#26BDE2", 7: "#FCC30B", 8: "#A21942", 9: "#FD6925", 10: "#DD1367",
    11: "#FD9D24", 12: "#BF8B2E", 13: "#3F7E44", 14: "#0A97D9", 15: "#56C02B",
    16: "#00689D", 17: "#19486A",
  };
  if (!match) return { sdg: hint || "Good Health and Well-Being", sdgColor: "#4C9F38" };
  const number = parseInt(match[1], 10);
  return { sdg: match[2].trim(), sdgColor: colours[number] ?? "#4C9F38" };
}

async function calculateImpact(
  activities: SelectedActivity[],
  donationsGBP: number,
  customActivities?: CustomActivityInput[],
): Promise<CalculateResponse> {
  const res = await fetch(`${BASE}/api/impact/calculate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: customActivities?.[0]?.name ?? "Quick log with photo",
      activities,
      donationsGBP,
      additionalVolunteerHours: 0,
      customActivities,
    }),
  });
  if (!res.ok) throw new Error("Could not calculate impact");
  return (await res.json()) as CalculateResponse;
}

async function saveImpact(opts: {
  name: string;
  activities: SelectedActivity[];
  customActivities?: CustomActivityInput[];
  impactResult: CalculateResponse;
}): Promise<{ id: string }> {
  const res = await fetch(`${BASE}/api/impact/save`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // Ownership is derived from the authenticated session. The generated
      // contract still requires this legacy field, so send an inert value.
      userId: "",
      name: opts.name,
      activities: opts.activities,
      customActivities: opts.customActivities,
      impactResult: opts.impactResult,
      donationsGBP: 0,
      additionalVolunteerHours: 0,
      // Photo quick logs are per-occurrence actuals (see contribution model).
      kind: "quick_log",
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : "Could not save record");
  }
  return (await res.json()) as { id: string };
}

async function uploadPhoto(blob: Blob, recordIdNumeric: number): Promise<void> {
  const mimeType = blob.type || "image/jpeg";
  const urlRes = await fetch(`${BASE}/api/attachments/upload-url`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mimeType, byteSize: blob.size, kind: "photo", recordId: recordIdNumeric }),
  });
  if (!urlRes.ok) throw new Error("Could not request upload URL");
  const { uploadUrl, storageKey } = (await urlRes.json()) as { uploadUrl: string; storageKey: string };

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
    body: blob,
  });
  if (!putRes.ok) throw new Error("Upload to storage failed");

  const regRes = await fetch(`${BASE}/api/attachments/register`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageKey,
      mimeType,
      byteSize: blob.size,
      kind: "photo",
      recordId: recordIdNumeric,
    }),
  });
  if (!regRes.ok) throw new Error("Could not register photo");
}

export default function QuickLogPhoto() {
  const { isLoggedIn, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [stage, setStage] = useState<Stage>("camera");
  const [snapshot, setSnapshot] = useState<{ blob: Blob; objectUrl: string } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [savingTplId, setSavingTplId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [analysed, setAnalysed] = useState<AnalysedActivity | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [describeError, setDescribeError] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [savedDescription, setSavedDescription] = useState("");
  const [showDescriptionForm, setShowDescriptionForm] = useState(false);
  const [rememberedDescriptions, setRememberedDescriptions] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SAVED_DESCRIPTIONS_KEY) ?? "[]");
      return Array.isArray(stored) ? stored.filter((item): item is string => typeof item === "string").slice(0, 5) : [];
    } catch {
      return [];
    }
  });

  const templatesQuery = useListRecurringTemplates({
    query: { enabled: isLoggedIn, queryKey: getListRecurringTemplatesQueryKey() },
  });
  const templates: RecurringTemplate[] = templatesQuery.data?.templates ?? [];

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Your browser doesn't support live camera access. Tap the Choose photo button below to pick or take one.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
    } catch (err) {
      const name = (err as { name?: string })?.name ?? "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setCameraError("Camera access was blocked. Tap the Choose photo button below or enable camera permission in your browser settings.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setCameraError("No camera found on this device. Tap Choose photo to pick one from your library.");
      } else {
        setCameraError("Couldn't start the camera. Tap Choose photo below to pick one instead.");
      }
    }
  }, []);

  useEffect(() => {
    if (stage === "camera" && isLoggedIn) {
      void startCamera();
    }
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, isLoggedIn]);

  useEffect(() => {
    return () => {
      if (snapshot?.objectUrl) URL.revokeObjectURL(snapshot.objectUrl);
    };
  }, [snapshot]);

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      toast({ title: "Camera not ready", description: "Wait a moment and try again.", variant: "destructive" });
      return;
    }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          toast({ title: "Couldn't capture photo", variant: "destructive" });
          return;
        }
        if (snapshot?.objectUrl) URL.revokeObjectURL(snapshot.objectUrl);
        setSnapshot({ blob, objectUrl: URL.createObjectURL(blob) });
        setStage("preview");
        stopStream();
      },
      "image/jpeg",
      0.9,
    );
  };

  const handleFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (snapshot?.objectUrl) URL.revokeObjectURL(snapshot.objectUrl);
    setSnapshot({ blob: file, objectUrl: URL.createObjectURL(file) });
    setStage("preview");
    stopStream();
  };

  const retake = () => {
    if (snapshot?.objectUrl) URL.revokeObjectURL(snapshot.objectUrl);
    setSnapshot(null);
    setDescription("");
    setAnalysed(null);
    setDescribeError("");
    setShowDescriptionForm(false);
    setStage("camera");
  };

  const analyseDescription = async () => {
    const name = description.trim();
    if (!name) return;
    setAnalysing(true);
    setDescribeError("");
    try {
      const res = await fetch(`${BASE}/api/custom-activity/analyse`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.code === "ai_unavailable" ? "ai_unavailable" : "analyse_failed");
      }
      const result = (await res.json()) as AnalysedActivity;
      setAnalysed(result);
      setQuantity(Math.max(1, result.defaultQuantity || 1));
      setStage("details");
    } catch (err) {
      setDescribeError(
        err instanceof Error && err.message === "ai_unavailable"
          ? "Our analysis service is having a moment. Please try again shortly."
          : "Couldn't understand that yet. Add what you did, for how long, and who it helped.",
      );
    } finally {
      setAnalysing(false);
    }
  };

  const handleSaveDescription = async () => {
    if (!snapshot || !analysed || !description.trim()) return;
    setStage("saving");
    try {
      const enteredQuantity = Math.max(1, Number(quantity) || analysed.defaultQuantity || 1);
      const isHourUnit = analysed.unit === "hour";
      const { sdg, sdgColor } = sdgFromHint(analysed.sdgHint);
      const customActivities: CustomActivityInput[] = [{
        activityId: `custom_${Date.now()}`,
        name: description.trim(),
        quantity: isHourUnit ? 1 : enteredQuantity,
        hoursPerYear: isHourUnit ? enteredQuantity : analysed.unit === "pound" ? 0 : Math.max(1, Math.round(enteredQuantity * 2)),
        valuePerUnit: analysed.proxyMatch?.valuePerUnit ?? 0,
        unit: analysed.unit,
        proxy: analysed.proxyMatch?.title ?? "",
        proxyYear: analysed.proxyMatch?.proxyYear ?? "",
        sdg,
        sdgColor,
      }];
      const result = await calculateImpact([], 0, customActivities);
      const saved = await saveImpact({
        name: description.trim(),
        activities: [],
        customActivities,
        impactResult: result,
      });
      const numericId = parseInt(saved.id, 10);
      if (!Number.isFinite(numericId)) throw new Error("Invalid record id returned");
      await uploadPhoto(snapshot.blob, numericId);
      setSavedDescription(description.trim());
      setStage("done");
      toast({ title: "Logged with photo", description: "Your activity and photo are now in your history." });
    } catch (err) {
      toast({
        title: "Couldn't save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      setStage("details");
    }
  };

  const rememberDescription = () => {
    if (!savedDescription) return;
    const next = [savedDescription, ...rememberedDescriptions.filter((item) => item !== savedDescription)].slice(0, 5);
    localStorage.setItem(SAVED_DESCRIPTIONS_KEY, JSON.stringify(next));
    setRememberedDescriptions(next);
    toast({ title: "Saved for next time", description: "It will appear as a shortcut when you use photo logging again." });
    navigate("/history");
  };

  const handleSaveWithTemplate = async (template: RecurringTemplate) => {
    if (!snapshot) return;
    setSavingTplId(template.id);
    setStage("saving");
    try {
      const activities = template.defaultActivities;
      const donations = template.defaultDonationsGBP ?? 0;
      const result = await calculateImpact(activities, donations);
      const saved = await saveImpact({
        name: template.label,
        activities,
        impactResult: result,
      });
      const numericId = parseInt(saved.id, 10);
      if (!Number.isFinite(numericId)) throw new Error("Invalid record id returned");
      await uploadPhoto(snapshot.blob, numericId);
      toast({
        title: "Logged with photo",
        description: `Saved "${template.label}" and attached your photo.`,
      });
      setStage("done");
      setTimeout(() => navigate("/history"), 600);
    } catch (err) {
      toast({
        title: "Couldn't save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
      setStage("preview");
    } finally {
      setSavingTplId(null);
    }
  };

  if (isLoading) {
    return null;
  }
  if (!isLoggedIn) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">Sign in to use Quick Log with a photo.</p>
        <Link href="/login" className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold">
          Log in
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-display font-bold text-foreground">Quick log + photo</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Snap a photo, then choose a regular activity or describe what you did.
          </p>
        </div>
        <Link
          href="/history"
          className="ml-3 p-2 rounded-full text-muted-foreground hover:bg-muted/30"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </Link>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileFallback}
      />
      <canvas ref={canvasRef} className="hidden" />

      <AnimatePresence mode="wait">
        {stage === "camera" && (
          <motion.div
            key="camera"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-black rounded-2xl overflow-hidden relative aspect-[3/4]"
          >
            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-6 bg-gradient-to-b from-zinc-900 to-zinc-800">
                <Camera className="w-10 h-10 mb-3 opacity-70" />
                <p className="text-sm leading-relaxed max-w-xs">{cameraError}</p>
              </div>
            ) : (
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-full object-cover bg-black"
                aria-label="Live camera preview"
              />
            )}
            <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/90 text-foreground text-xs font-medium shadow"
                aria-label="Choose photo from library"
              >
                <ImageIcon className="w-3.5 h-3.5" /> Choose photo
              </button>
              {!cameraError && (
                <button
                  type="button"
                  onClick={handleCapture}
                  className="w-16 h-16 rounded-full bg-white border-4 border-white/60 shadow-lg active:scale-95 transition-transform"
                  aria-label="Take photo"
                  data-testid="quick-log-capture"
                />
              )}
              <span className="w-[88px]" aria-hidden="true" />
            </div>
          </motion.div>
        )}

        {(stage === "preview" || stage === "details" || stage === "saving" || stage === "done") && snapshot && (
          <motion.div
            key="preview"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="bg-black rounded-2xl overflow-hidden relative aspect-[3/4]">
              <img
                src={snapshot.objectUrl}
                alt="Captured snapshot"
                className="w-full h-full object-cover"
              />
              {stage === "saving" && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              )}
              {stage === "preview" && (
                <button
                  type="button"
                  onClick={retake}
                  className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-medium"
                  aria-label="Retake photo"
                >
                  <RefreshCw className="w-3 h-3" /> Retake
                </button>
              )}
            </div>

            <div className="mt-5">
              {stage === "done" ? (
                <div className="rounded-xl border border-border bg-white px-5 py-5 text-center" data-testid="quick-log-photo-done">
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-primary text-white flex items-center justify-center">
                    <Check className="w-5 h-5" aria-hidden="true" />
                  </div>
                  <p className="text-base font-semibold text-foreground">Activity saved with your photo</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Would you like a shortcut for this description next time?</p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <button
                      type="button"
                      onClick={rememberDescription}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold"
                      data-testid="quick-log-photo-remember"
                    >
                      <Bookmark className="w-4 h-4" aria-hidden="true" /> Save for next time
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/history")}
                      className="px-4 py-2.5 rounded-lg border border-border text-sm font-medium"
                    >
                      Not now
                    </button>
                  </div>
                </div>
              ) : templates.length === 0 || showDescriptionForm ? (
                <div className="rounded-xl border border-border bg-white px-4 py-4">
                  {analysed && stage !== "preview" ? (
                    <>
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{description.trim()}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{analysed.friendlyQuestion}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setStage("preview"); setAnalysed(null); }}
                          className="text-xs text-primary font-medium"
                        >
                          Change
                        </button>
                      </div>
                      <NumberInput
                        min="1"
                        value={quantity}
                        onChange={(event) => setQuantity(Number(event.target.value))}
                        aria-label={analysed.unitLabel}
                        className="w-full px-3 py-2.5 rounded-lg border border-border bg-white text-sm"
                        data-testid="quick-log-photo-quantity"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1.5">{analysed.unitLabel}</p>
                      <button
                        type="button"
                        onClick={handleSaveDescription}
                        disabled={stage !== "details"}
                        className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-60"
                        data-testid="quick-log-photo-save-description"
                      >
                        <Camera className="w-4 h-4" aria-hidden="true" /> Save activity with photo
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-foreground font-semibold mb-1">What did you do?</p>
                      <p className="text-xs text-muted-foreground mb-3">Write it naturally — include roughly how long it took if you can.</p>
                      {rememberedDescriptions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-3" aria-label="Saved activity descriptions">
                          {rememberedDescriptions.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => setDescription(item)}
                              className="px-3 py-1.5 rounded-full bg-muted/40 text-xs font-medium text-foreground text-left"
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      )}
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="e.g. Helped clear litter from the park for 2 hours"
                        rows={3}
                        className="w-full p-3 rounded-lg border border-border bg-white text-sm resize-none focus:border-primary outline-none"
                        data-testid="quick-log-photo-description"
                      />
                      {describeError && <p className="text-xs text-destructive mt-2">{describeError}</p>}
                      <button
                        type="button"
                        onClick={analyseDescription}
                        disabled={!description.trim() || analysing}
                        className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50"
                        data-testid="quick-log-photo-analyse"
                      >
                        {analysing ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</> : <><Sparkles className="w-4 h-4" /> Continue</>}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Tap an activity to save with this photo
                </p>
                <ul className="grid gap-2">
                  {templates.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => handleSaveWithTemplate(t)}
                        disabled={stage !== "preview"}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-white hover:bg-muted/20 active:scale-[0.99] transition disabled:opacity-60 disabled:cursor-not-allowed text-left"
                        data-testid={`quick-log-photo-template-${t.id}`}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: "rgba(240, 97, 39, 0.10)" }}
                        >
                          {savingTplId === t.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--brand-orange-bright)" }} />
                          ) : (
                            <Camera className="w-4 h-4" style={{ color: "var(--brand-orange-bright)" }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{t.label}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{describeCadence(t)}</p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => { setDescription(""); setAnalysed(null); setDescribeError(""); setShowDescriptionForm(true); }}
                  className="mt-3 text-sm font-medium text-primary"
                >
                  Something else — describe what you did
                </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
