import { useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  value: string;
  copyLabel?: ReactNode;
  copiedLabel?: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  ariaLabel?: string;
  testId?: string;
  icon?: ReactNode;
  copiedIcon?: ReactNode;
  iconClassName?: string;
  resetDelay?: number;
  fallbackRef?: RefObject<(HTMLInputElement | HTMLTextAreaElement) | null>;
  onCopied?: () => void;
  onCopyError?: () => void;
}

export function CopyButton({
  value,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  className = "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/30 transition-colors shrink-0 disabled:opacity-60",
  style,
  disabled = false,
  ariaLabel,
  testId,
  icon,
  copiedIcon,
  iconClassName = "w-3.5 h-3.5",
  resetDelay = 2000,
  fallbackRef,
  onCopied,
  onCopyError,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      try {
        if (!fallbackRef?.current) throw new Error("copy failed");
        fallbackRef.current.select();
        if (!document.execCommand("copy")) throw new Error("copy failed");
      } catch {
        onCopyError?.();
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), resetDelay);
    onCopied?.();
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      className={className}
      style={style}
      aria-label={ariaLabel}
      data-testid={testId}
    >
      {copied
        ? (copiedIcon ?? <Check className={`${iconClassName} text-green-600`} aria-hidden="true" />)
        : (icon ?? <Copy className={iconClassName} aria-hidden="true" />)}
      {copied ? copiedLabel : copyLabel}
    </button>
  );
}

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
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const buttonClass =
    buttonVariant === "primary"
      ? "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors shrink-0 disabled:opacity-60"
      : "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted/30 transition-colors shrink-0 disabled:opacity-60";
  const buttonStyle = buttonVariant === "primary" ? { background: "var(--brand-orange-bright)" } : undefined;

  const copyButton = (
    <CopyButton
      value={value}
      copyLabel={copyLabel}
      copiedLabel={copiedLabel}
      className={buttonClass}
      style={buttonStyle}
      disabled={disabled}
      ariaLabel={ariaLabel ? `Copy ${ariaLabel}` : String(copyLabel)}
      testId={buttonTestId}
      fallbackRef={fieldRef}
      onCopied={onCopied}
      onCopyError={onCopyError}
    />
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
