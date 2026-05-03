import { useLocale } from "@/i18n";
import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from "@/i18n/config";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface LanguageToggleProps {
  variant?: "pill" | "inline";
  className?: string;
  showToast?: boolean;
  onChange?: (locale: Locale) => void;
}

export function LanguageToggle({
  variant = "inline",
  className,
  showToast = false,
  onChange,
}: LanguageToggleProps) {
  const { locale, setLocale, t } = useLocale();
  const { toast } = useToast();

  const handleSelect = (next: Locale) => {
    if (next === locale) return;
    setLocale(next);
    if (showToast) {
      toast({
        title: t("settings.languageChangedToast"),
        description: t("settings.languageChangedDesc"),
      });
    }
    onChange?.(next);
  };

  if (variant === "pill") {
    return (
      <div
        className={cn(
          "items-center rounded-full p-0.5 text-[11px] font-bold gap-0.5",
          className,
        )}
        style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}
        role="group"
        aria-label={t("navbar.languagePickerLabel")}
      >
        {SUPPORTED_LOCALES.map((l) => {
          const active = l === locale;
          return (
            <button
              key={l}
              type="button"
              onClick={() => handleSelect(l)}
              aria-pressed={active}
              className={cn(
                "px-2.5 py-1 rounded-full transition-colors min-w-[34px]",
                active ? "text-foreground" : "text-white/70 hover:text-white",
              )}
              style={active ? { background: "white" } : undefined}
            >
              {LOCALE_LABELS[l].short}
            </button>
          );
        })}
      </div>
    );
  }

  // inline (used inside dropdowns / settings rows)
  return (
    <div
      className={cn("inline-flex items-center rounded-md border border-border bg-muted/30 p-0.5 text-xs font-semibold", className)}
      role="group"
      aria-label={t("navbar.languagePickerLabel")}
    >
      {SUPPORTED_LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            onClick={() => handleSelect(l)}
            aria-pressed={active}
            className={cn(
              "px-2.5 py-1 rounded transition-colors",
              active ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {LOCALE_LABELS[l].short}
          </button>
        );
      })}
    </div>
  );
}
