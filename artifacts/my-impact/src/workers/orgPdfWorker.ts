/// <reference lib="webworker" />
import { renderOrgPdf, type RenderOrgPdfArgs } from "@/lib/org-pdf-render";

interface BuildRequest {
  type: "build";
  seq: number;
  args: RenderOrgPdfArgs;
}

interface BuildSuccess {
  type: "result";
  seq: number;
  blob: Blob;
}

interface BuildSkipped {
  type: "skipped";
  seq: number;
}

interface BuildFailure {
  type: "error";
  seq: number;
  message: string;
}

export type OrgPdfWorkerRequest = BuildRequest;
export type OrgPdfWorkerResponse = BuildSuccess | BuildSkipped | BuildFailure;

// Last-write-wins. Under rapid filter changes we may have multiple build
// requests queued before the worker can render the first one. We track the
// highest seq we've seen and yield once before rendering so any newer
// requests already sitting in the message queue can bump `latestSeq`.
// Stale jobs then exit immediately instead of spending hundreds of ms on a
// PDF the main thread is going to throw away anyway.
let latestSeq = 0;

self.addEventListener("message", async (e: MessageEvent<OrgPdfWorkerRequest>) => {
  const msg = e.data;
  if (!msg || msg.type !== "build") return;
  if (msg.seq > latestSeq) latestSeq = msg.seq;

  // Yield to the worker event loop so any queued newer messages get a
  // chance to update `latestSeq` before we start the (heavy) render.
  await new Promise<void>(r => setTimeout(r, 0));

  if (msg.seq < latestSeq) {
    const skipped: BuildSkipped = { type: "skipped", seq: msg.seq };
    (self as DedicatedWorkerGlobalScope).postMessage(skipped);
    return;
  }

  try {
    const doc = renderOrgPdf(msg.args);
    const blob = doc.output("blob");
    const ok: BuildSuccess = { type: "result", seq: msg.seq, blob };
    (self as DedicatedWorkerGlobalScope).postMessage(ok);
  } catch (err) {
    const fail: BuildFailure = {
      type: "error",
      seq: msg.seq,
      message: err instanceof Error ? err.message : String(err),
    };
    (self as DedicatedWorkerGlobalScope).postMessage(fail);
  }
});
