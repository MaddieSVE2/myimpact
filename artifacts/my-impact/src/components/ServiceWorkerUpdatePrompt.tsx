import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocale } from "@/i18n";
import {
  applyServiceWorkerUpdate,
  registerServiceWorkerWithUpdates,
} from "@/lib/registerServiceWorker";

export function ServiceWorkerUpdatePrompt() {
  const { toast } = useToast();
  const { t } = useLocale();
  const registeredRef = useRef(false);
  const promptedRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    const scriptUrl = `${import.meta.env.BASE_URL}service-worker.js`;
    registerServiceWorkerWithUpdates(scriptUrl, (registration) => {
      if (promptedRef.current) return;
      promptedRef.current = true;
      toast({
        title: t("appUpdate.title"),
        description: t("appUpdate.description"),
        duration: Infinity,
        action: (
          <ToastAction
            altText={t("appUpdate.refresh")}
            onClick={() => applyServiceWorkerUpdate(registration)}
          >
            {t("appUpdate.refresh")}
          </ToastAction>
        ),
      });
    });
  }, [toast, t]);

  return null;
}
