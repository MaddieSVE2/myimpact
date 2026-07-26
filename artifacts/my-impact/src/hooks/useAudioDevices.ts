import { useCallback, useEffect, useState } from "react";

// Chrome/Edge support routing playback to a chosen output via setSinkId;
// Safari/Firefox don't, so we show "System default" without a picker there.
export const OUTPUT_SELECTION_SUPPORTED =
  typeof HTMLMediaElement !== "undefined" &&
  "setSinkId" in HTMLMediaElement.prototype;

export const AUDIO_DEVICES_SUPPORTED =
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getUserMedia === "function";

export const MIC_DEVICE_KEY = "myimpact:sidekick:micDeviceId";
export const OUTPUT_DEVICE_KEY = "myimpact:sidekick:outputDeviceId";

// Fired on window whenever a device selection changes so every mounted copy
// of the hook (Sidekick panel, Settings page) stays in sync within the tab.
const DEVICE_SELECTION_EVENT = "myimpact:sidekick:deviceSelectionChanged";

function loadStoredDeviceId(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storeDeviceId(key: string, value: string | null) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
  try {
    window.dispatchEvent(new CustomEvent(DEVICE_SELECTION_EVENT, { detail: { key } }));
  } catch {
    // ignore
  }
}

/** Strip browser-added prefixes like "Default - " for a tidier display. */
export function cleanDeviceLabel(label: string): string {
  return label.replace(/^(Default|Communications)\s*-\s*/i, "").trim();
}

/**
 * Enumerates audio input/output devices and tracks the user's preferred
 * mic/output. Device labels are only available once mic permission has been
 * granted, so `permissionGranted` doubles as "can we show real names yet".
 * Selections persist in localStorage; if a chosen device is unplugged the
 * selection is cleared so recording/playback fall back to the default.
 * All mounted instances (Sidekick panel, Settings) stay in sync via a
 * same-tab custom event plus the cross-tab `storage` event.
 */
export function useAudioDevices(enabled: boolean) {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [micId, setMicIdState] = useState<string | null>(() => loadStoredDeviceId(MIC_DEVICE_KEY));
  const [outputId, setOutputIdState] = useState<string | null>(() => loadStoredDeviceId(OUTPUT_DEVICE_KEY));

  const refresh = useCallback(async () => {
    if (!AUDIO_DEVICES_SUPPORTED) return;
    if (typeof navigator.mediaDevices.enumerateDevices !== "function") return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const ins = devices.filter((d) => d.kind === "audioinput");
      const outs = devices.filter((d) => d.kind === "audiooutput");
      setInputs(ins);
      setOutputs(outs);
      // Labels are empty strings until getUserMedia has been granted.
      setPermissionGranted(ins.some((d) => d.label !== ""));
    } catch {
      // enumeration can fail in odd embeds; leave existing state alone
    }
  }, []);

  useEffect(() => {
    if (!enabled || !AUDIO_DEVICES_SUPPORTED) return;
    refresh();
    const md = navigator.mediaDevices;
    if (typeof md.addEventListener !== "function") return;
    md.addEventListener("devicechange", refresh);
    return () => md.removeEventListener("devicechange", refresh);
  }, [enabled, refresh]);

  // Keep in sync with selections made elsewhere: same tab (custom event) and
  // other tabs (storage event).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      setMicIdState(loadStoredDeviceId(MIC_DEVICE_KEY));
      setOutputIdState(loadStoredDeviceId(OUTPUT_DEVICE_KEY));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === MIC_DEVICE_KEY || e.key === OUTPUT_DEVICE_KEY) sync();
    };
    window.addEventListener(DEVICE_SELECTION_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DEVICE_SELECTION_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Clear a stored selection once we can see the device list and the chosen
  // device is no longer present (e.g. headset unplugged).
  useEffect(() => {
    if (!permissionGranted) return;
    if (micId && inputs.length > 0 && !inputs.some((d) => d.deviceId === micId)) {
      setMicIdState(null);
      storeDeviceId(MIC_DEVICE_KEY, null);
    }
    if (outputId && outputs.length > 0 && !outputs.some((d) => d.deviceId === outputId)) {
      setOutputIdState(null);
      storeDeviceId(OUTPUT_DEVICE_KEY, null);
    }
  }, [permissionGranted, inputs, outputs, micId, outputId]);

  const setMicId = useCallback((id: string | null) => {
    setMicIdState(id);
    storeDeviceId(MIC_DEVICE_KEY, id);
  }, []);

  const setOutputId = useCallback((id: string | null) => {
    setOutputIdState(id);
    storeDeviceId(OUTPUT_DEVICE_KEY, id);
  }, []);

  return { inputs, outputs, permissionGranted, micId, outputId, setMicId, setOutputId, refresh };
}
