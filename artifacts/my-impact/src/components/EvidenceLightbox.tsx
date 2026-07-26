import { useEffect } from "react";
import { X } from "lucide-react";

export interface EvidenceLightboxData {
  url: string;
  memberName?: string;
  activityLabel?: string;
  dateLabel?: string;
}

export default function EvidenceLightbox({
  item,
  onClose,
}: {
  item: EvidenceLightboxData | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [item, onClose]);

  if (!item) return null;

  const contextParts = [item.memberName, item.activityLabel, item.dateLabel].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label="Evidence photo viewer"
      onClick={onClose}
      data-testid="evidence-lightbox"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-3 right-3 sm:top-4 sm:right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        aria-label="Close photo viewer"
        data-testid="evidence-lightbox-close"
      >
        <X className="w-5 h-5" />
      </button>
      <div
        className="max-w-4xl w-full max-h-full flex flex-col items-center gap-3"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={item.url}
          alt={
            contextParts.length > 0
              ? `Evidence photo — ${contextParts.join(", ")}`
              : "Evidence photo"
          }
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
          data-testid="evidence-lightbox-image"
        />
        {contextParts.length > 0 && (
          <p
            className="text-white/90 text-sm text-center px-2"
            data-testid="evidence-lightbox-context"
          >
            {item.memberName && <span className="font-semibold">{item.memberName}</span>}
            {item.memberName && (item.activityLabel || item.dateLabel) && <span> · </span>}
            {item.activityLabel && <span>{item.activityLabel}</span>}
            {item.activityLabel && item.dateLabel && <span> · </span>}
            {item.dateLabel && <span className="text-white/70">{item.dateLabel}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
