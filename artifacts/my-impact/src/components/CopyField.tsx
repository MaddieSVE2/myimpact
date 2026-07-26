import { useRef, useState, type ReactNode } from "react";
import { Copy, Check } from "lucide-react";

interface CopyFieldProps {
  value: string;
  multiline?: boolean;
  rows?: number;
  copyLabel?: string;
  copiedLabel?: string;
  buttonVariant?: "primary" | "outline";
  disabled?: boolean;
  ariaLabel?: string;
  inputTestId?: string;
  buttonTestId?: string;
  onCopied?: () => void;
  onCopyError?: () => void;
  children?: ReactNode;
}

export default function CopyField({
  value,
  multiline = false,
  rows = 5,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  buttonVariant = "outline",
  disabled = false,
  ariaLabel,
  inputTestId,
  buttonTestId,
  onCopied,
  onCopyError,
  children,
}: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      try {
        if (!fieldRef.current) throw new Error("copy failed");
        fieldRef.current.select();
        if (!document.execCommand("copy")) throw new Error("copy failed");
      } catch {
        onCopyError?.();
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopied?.();
  };

  const buttonClass =
    buttonVariant === "primary"
      ? "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors shrink-0 disabled:opacity-60"
      : "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/30 transition-colors shrink-0 disabled:opacity-60";
  const buttonStyle = buttonVariant === "primary" ? { background: "var(--brand-orange-bright)" } : undefined;

  const copyButton = (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      className={buttonClass}
      style={buttonStyle}
      aria-label={ariaLabel ? `Copy ${ariaLabel}` : copyLabel}
      data-testid={buttonTestId}
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-600" aria-hidden="true" />
        : <Copy className="w-3.5 h-3.5" aria-hidden="true" />}
      {copied ? copiedLabel : copyLabel}
    </button>
  );

  if (multiline) {
    return (
      <div>
        <textarea
          ref={fieldRef}
          readOnly
          value={value}
          rows={rows}
          onFocus={e => e.currentTarget.select()}
          className="copy-field w-full px-3 py-2.5 rounded-lg border border-border text-xs bg-white resize-none focus:outline-none leading-relaxed"
          aria-label={ariaLabel}
          data-testid={inputTestId}
        />
        <div className="mt-2.5 flex items-center gap-2">
          {copyButton}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fieldRef}
        type="text"
        readOnly
        value={value}
        onFocus={e => e.currentTarget.select()}
        onClick={e => (e.target as HTMLInputElement).select()}
        className="copy-field flex-1 min-w-0 px-3 py-2 rounded-lg border border-border text-xs font-mono bg-white truncate focus:outline-none focus:border-primary"
        aria-label={ariaLabel}
        data-testid={inputTestId}
      />
      {copyButton}
      {children}
    </div>
  );
}
