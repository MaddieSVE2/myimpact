import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Paperclip, X, Trash2, FileText, Loader2, AlertCircle, AlertTriangle } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface AttachmentItem {
  id: string;
  kind: "photo" | "receipt";
  mimeType: string;
  byteSize: number;
  recordId: number | null;
  journalId: number | null;
  createdAt: string;
  url: string;
}

interface AttachmentsProps {
  recordId?: number;
  journalId?: number;
  /** Allow uploading a single PDF receipt (donations only). */
  allowReceipt?: boolean;
  /** Maximum images allowed. Defaults: 4 for records, 1 for journals. */
  maxImages?: number;
  /** Optional compact label override. */
  label?: string;
  /** Hide the heading row. */
  compact?: boolean;
  /** Callback after attachments change. */
  onChange?: (items: AttachmentItem[]) => void;
}

const IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif";
const RECEIPT_ACCEPT = "application/pdf";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface UsageData {
  usedBytes: number;
  capBytes: number;
  maxFileSizeBytes: number;
}

export default function Attachments({
  recordId,
  journalId,
  allowReceipt = false,
  maxImages,
  label,
  compact = false,
  onChange,
}: AttachmentsProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<AttachmentItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/attachments/usage`, { credentials: "include" });
      if (!res.ok) return;
      const data = (await res.json()) as UsageData;
      setUsage(data);
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => { void fetchUsage(); }, [fetchUsage]);

  const usagePct = usage ? Math.min(100, (usage.usedBytes / usage.capBytes) * 100) : 0;
  const showStorageWarning = usage != null && usagePct >= 80;
  const isStorageFull = usage != null && usagePct >= 95;

  const goToSettings = useCallback(() => setLocation("/settings"), [setLocation]);

  const showQuotaToast = useCallback((message: string) => {
    toast({
      title: "Storage full",
      description: message,
      variant: "destructive",
      action: (
        <ToastAction altText="Manage storage" onClick={goToSettings}>
          Manage storage
        </ToastAction>
      ),
    });
  }, [toast, goToSettings]);

  const photos = items.filter(i => i.kind === "photo");
  const receipts = items.filter(i => i.kind === "receipt");
  const photoLimit = maxImages ?? (journalId != null ? 1 : 4);

  const queryString = recordId != null
    ? `recordId=${recordId}`
    : journalId != null
      ? `journalId=${journalId}`
      : "";

  const refresh = useCallback(async () => {
    if (!queryString) return;
    try {
      const res = await fetch(`${BASE}/api/attachments/list?${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error("list failed");
      const data = (await res.json()) as { attachments: AttachmentItem[] };
      setItems(data.attachments);
      onChange?.(data.attachments);
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, [queryString, onChange]);

  useEffect(() => { void refresh(); }, [refresh]);

  const upload = async (file: File, kind: "photo" | "receipt") => {
    if (file.size > MAX_FILE_BYTES) {
      toast({ title: "File too large", description: "Maximum size is 10 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const body: Record<string, unknown> = {
        mimeType: file.type,
        byteSize: file.size,
        kind,
      };
      if (recordId != null) body.recordId = recordId;
      if (journalId != null) body.journalId = journalId;

      const urlRes = await fetch(`${BASE}/api/attachments/upload-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({ error: "Upload failed" }));
        const message = typeof err.error === "string" ? err.error : "Upload failed";
        if (urlRes.status === 413) {
          showQuotaToast(`${message} Free up space by deleting old attachments.`);
          return;
        }
        throw new Error(message);
      }
      const { uploadUrl, storageKey } = await urlRes.json() as { uploadUrl: string; storageKey: string };

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      const regRes = await fetch(`${BASE}/api/attachments/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey,
          mimeType: file.type,
          byteSize: file.size,
          kind,
          ...(recordId != null ? { recordId } : {}),
          ...(journalId != null ? { journalId } : {}),
        }),
      });
      if (!regRes.ok) {
        const err = await regRes.json().catch(() => ({ error: "Save failed" }));
        const message = typeof err.error === "string" ? err.error : "Save failed";
        if (regRes.status === 413) {
          showQuotaToast(`${message} Free up space by deleting old attachments.`);
          return;
        }
        throw new Error(message);
      }
      await refresh();
      void fetchUsage();
      toast({ title: kind === "receipt" ? "Receipt added" : "Photo added" });
    } catch (e) {
      toast({
        title: "Couldn't attach file",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
      if (receiptInputRef.current) receiptInputRef.current.value = "";
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    const remaining = photoLimit - photos.length;
    const toUpload = files.slice(0, Math.max(0, remaining));
    if (files.length > toUpload.length) {
      toast({
        title: "Some files skipped",
        description: `Only ${remaining} more photo${remaining === 1 ? "" : "s"} can be added.`,
      });
    }
    void (async () => {
      for (const f of toUpload) await upload(f, "photo");
    })();
  };

  const handleReceiptSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void upload(file, "receipt");
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${BASE}/api/attachments/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("delete failed");
      await refresh();
      void fetchUsage();
    } catch {
      toast({ title: "Couldn't remove", description: "Please try again.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const openReceipt = async (att: AttachmentItem) => {
    try {
      const res = await fetch(`${BASE}/api/attachments/${att.id}/signed-url`, { credentials: "include" });
      if (!res.ok) throw new Error("signed url failed");
      const { url } = await res.json() as { url: string };
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast({ title: "Couldn't open receipt", variant: "destructive" });
    }
  };

  const photosFull = photos.length >= photoLimit;
  const hasReceipt = receipts.length > 0;

  return (
    <div className={compact ? "" : "mt-3"}>
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Paperclip className="w-3 h-3" aria-hidden="true" />
            {label ?? "Photos & receipts"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {photos.length}/{photoLimit}
            {allowReceipt && (hasReceipt ? " · receipt ✓" : "")}
          </p>
        </div>
      )}

      {/* Storage warning */}
      {showStorageWarning && (
        <div
          className={`mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
            isStorageFull
              ? "border-red-300 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
              : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
          }`}
          role="status"
        >
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1 leading-snug">
            {isStorageFull
              ? <>You're out of storage ({Math.round(usagePct)}% of {Math.round((usage?.capBytes ?? 0) / (1024 * 1024))} MB used). Delete old attachments to free space.</>
              : <>You've used {Math.round(usagePct)}% of your storage. Tidy up old attachments before you hit the limit.</>
            }
            {" "}
            <button
              type="button"
              onClick={goToSettings}
              className="underline font-medium hover:no-underline"
            >
              Manage storage
            </button>
          </div>
        </div>
      )}

      {/* Upload buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={uploading || photosFull}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Camera className="w-3.5 h-3.5" aria-hidden="true" />}
          {photos.length === 0 ? "Add photo" : `Add photo (${photos.length}/${photoLimit})`}
        </button>
        <input
          ref={photoInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          multiple={photoLimit > 1}
          className="hidden"
          onChange={handlePhotoSelect}
        />
        {allowReceipt && (
          <>
            <button
              type="button"
              onClick={() => receiptInputRef.current?.click()}
              disabled={uploading || hasReceipt}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText className="w-3.5 h-3.5" aria-hidden="true" />
              {hasReceipt ? "Receipt attached" : "Add receipt (PDF)"}
            </button>
            <input
              ref={receiptInputRef}
              type="file"
              accept={RECEIPT_ACCEPT}
              className="hidden"
              onChange={handleReceiptSelect}
            />
          </>
        )}
      </div>

      {/* Thumbnail grid */}
      {!loading && items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {photos.map(p => (
            <div
              key={p.id}
              className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted/20"
            >
              <button
                type="button"
                onClick={() => setLightbox(p)}
                className="w-full h-full block"
                aria-label="View photo"
              >
                <img
                  src={`${BASE}${p.url}`}
                  alt="Attachment"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                disabled={deletingId === p.id}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-black/70 transition-all"
                aria-label="Remove photo"
              >
                {deletingId === p.id
                  ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                  : <X className="w-3 h-3" aria-hidden="true" />
                }
              </button>
            </div>
          ))}
          {receipts.map(r => (
            <div
              key={r.id}
              className="relative group flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/10"
            >
              <button
                type="button"
                onClick={() => openReceipt(r)}
                className="flex items-center gap-1.5 text-xs font-medium text-foreground hover:text-primary transition-colors"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                Receipt · {formatBytes(r.byteSize)}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                disabled={deletingId === r.id}
                className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                aria-label="Remove receipt"
              >
                {deletingId === r.id
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                }
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            key="lightbox-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
            <motion.img
              key="lightbox-img"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.2 }}
              src={`${BASE}${lightbox.url}`}
              alt="Attachment full size"
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface UsageBarProps {
  className?: string;
}

export function StorageUsageBar({ className }: UsageBarProps) {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/attachments/usage`, { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then((data: UsageData | null) => { if (data) setUsage(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className={className}>Loading…</div>;
  }
  if (!usage) {
    return (
      <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className ?? ""}`}>
        <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
        Storage usage unavailable.
      </div>
    );
  }

  const pct = Math.min(100, Math.round((usage.usedBytes / usage.capBytes) * 100));
  const usedMb = (usage.usedBytes / (1024 * 1024)).toFixed(1);
  const capMb = Math.round(usage.capBytes / (1024 * 1024));
  const isFull = pct >= 95;
  const isWarning = pct >= 80 && !isFull;

  const pctColorClass = isFull
    ? "text-red-600 dark:text-red-400"
    : isWarning
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-muted-foreground">
          {usedMb} MB of {capMb} MB used
        </p>
        <p className={`text-xs font-medium ${pctColorClass}`}>{pct}%</p>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            background: isFull ? "#dc2626" : isWarning ? "#f59e0b" : "#22c55e",
          }}
        />
      </div>
      {(isWarning || isFull) && (
        <div
          className={`mt-2 flex items-start gap-1.5 text-[11px] leading-snug ${
            isFull ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"
          }`}
          role="status"
        >
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {isFull
              ? "You're out of storage. Delete old photos or receipts below to free space."
              : "You're getting close to your storage limit. Consider tidying up old attachments."}
          </span>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
        Photos and receipts are stored privately. Each file can be up to {Math.round(usage.maxFileSizeBytes / (1024 * 1024))} MB.
      </p>
    </div>
  );
}
