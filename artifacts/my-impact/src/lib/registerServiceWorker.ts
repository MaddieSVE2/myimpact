type UpdateHandler = (registration: ServiceWorkerRegistration) => void;

export function registerServiceWorkerWithUpdates(
  scriptUrl: string,
  onUpdateReady: UpdateHandler
): void {
  if (!("serviceWorker" in navigator)) return;

  // Capture *before* registration: if there's already a controller, this
  // page was previously controlled by a SW, so any future "waiting" worker
  // really is an update (not a first install).
  const hadController = Boolean(navigator.serviceWorker.controller);

  // Only auto-reload on controller changes that represent a real update.
  // On a true first install there's no prior controller, so reloading then
  // would cause an unnecessary first-visit flicker.
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    if (!hadController) return;
    reloading = true;
    window.location.reload();
  });

  navigator.serviceWorker
    .register(scriptUrl)
    .then((registration) => {
      const notifyIfWaiting = () => {
        if (registration.waiting && hadController) {
          onUpdateReady(registration);
        }
      };

      // A waiting worker may already be present at registration time.
      notifyIfWaiting();

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") {
            notifyIfWaiting();
          }
        });
      });
    })
    .catch(() => undefined);
}

export function applyServiceWorkerUpdate(
  registration: ServiceWorkerRegistration
): void {
  const waiting = registration.waiting;
  if (!waiting) {
    window.location.reload();
    return;
  }
  waiting.postMessage({ type: "SKIP_WAITING" });
  // The `controllerchange` listener installed above will reload the page
  // once the new worker takes control.
}
