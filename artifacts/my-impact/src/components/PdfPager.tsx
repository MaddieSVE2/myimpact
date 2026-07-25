import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
// pdfjs-dist v4 ships ESM. We import the worker as a URL so Vite serves it
// from the dev server / hashes it into the production build instead of trying
// to bundle the worker into the main app graph.
import * as pdfjsLib from "pdfjs-dist";
// eslint-disable-next-line import/no-unresolved
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { NumberInput } from "@/components/ui/number-input";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>["promise"]>;

interface PdfPagerProps {
  /** Object URL or http(s) URL pointing at the PDF. */
  src: string;
  /** Display height of the main page viewport in pixels. */
  height?: number;
}

const THUMB_WIDTH = 96;

export function PdfPager({ src, height = 520 }: PdfPagerProps) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mainContainerRef = useRef<HTMLDivElement | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void; promise: Promise<void> } | null>(null);

  // Load the document whenever the src changes.
  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setNumPages(0);
    setCurrentPage(1);
    setLoadError(null);
    const task = pdfjsLib.getDocument({ url: src });
    task.promise
      .then((loaded) => {
        if (cancelled) {
          loaded.destroy();
          return;
        }
        setDoc(loaded);
        setNumPages(loaded.numPages);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Could not load preview");
      });
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [src]);

  // Tear down the document when it changes or unmounts.
  useEffect(() => {
    return () => {
      if (doc) doc.destroy();
    };
  }, [doc]);

  // Render the currently selected page into the main canvas.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await doc.getPage(currentPage);
        if (cancelled) return;
        const canvas = mainCanvasRef.current;
        const container = mainContainerRef.current;
        if (!canvas || !container) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const containerWidth = container.clientWidth - 16; // padding
        const containerHeight = container.clientHeight - 16;
        const scale = Math.min(
          containerWidth / baseViewport.width,
          containerHeight / baseViewport.height,
        );
        const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch { /* noop */ }
        }
        const task = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch {
        // Cancellation throws; ignore.
      }
    })();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch { /* noop */ }
      }
    };
  }, [doc, currentPage, height]);

  if (loadError) {
    return (
      <div
        className="w-full flex items-center justify-center text-xs text-red-600 bg-muted/20 border border-border rounded-md"
        style={{ height }}
      >
        {loadError}
      </div>
    );
  }

  if (!doc) {
    return (
      <div
        className="w-full flex items-center justify-center bg-muted/20 border border-border rounded-md"
        style={{ height }}
        data-testid="pdf-pager-loading"
      >
        <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const goPrev = () => setCurrentPage((p) => Math.max(1, p - 1));
  const goNext = () => setCurrentPage((p) => Math.min(numPages, p + 1));

  return (
    <div className="w-full" data-testid="pdf-pager">
      <div
        className="w-full bg-muted/20 border border-border rounded-md overflow-hidden flex"
        style={{ height }}
      >
        {/* Thumbnails */}
        <div
          className="shrink-0 h-full overflow-y-auto border-r border-border bg-white p-2 flex flex-col gap-2"
          style={{ width: THUMB_WIDTH + 24 }}
          data-testid="pdf-pager-thumbnails"
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
            <PdfThumbnail
              key={pageNum}
              doc={doc}
              pageNum={pageNum}
              isActive={pageNum === currentPage}
              onClick={() => setCurrentPage(pageNum)}
            />
          ))}
        </div>

        {/* Main page viewport */}
        <div
          ref={mainContainerRef}
          className="flex-1 h-full flex items-center justify-center overflow-auto p-2"
        >
          <canvas
            ref={mainCanvasRef}
            className="shadow-md bg-white"
            data-testid="pdf-pager-canvas"
          />
        </div>
      </div>

      {/* Pager controls */}
      <div className="mt-3 flex items-center justify-center gap-3 text-xs">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentPage <= 1}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border hover:bg-muted/30 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="pdf-pager-prev"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>

        <div
          className="text-foreground"
          data-testid="pdf-pager-status"
          aria-live="polite"
        >
          Page{" "}
          <NumberInput
            min={1}
            max={numPages}
            value={currentPage}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isFinite(v)) return;
              const clamped = Math.min(numPages, Math.max(1, Math.floor(v)));
              setCurrentPage(clamped);
            }}
            className="w-12 text-center px-1 py-0.5 rounded border border-border text-xs"
            data-testid="pdf-pager-input"
            aria-label="Jump to page"
          />{" "}
          of <span data-testid="pdf-pager-total">{numPages}</span>
        </div>

        <button
          type="button"
          onClick={goNext}
          disabled={currentPage >= numPages}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border hover:bg-muted/30 disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="pdf-pager-next"
          aria-label="Next page"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

interface PdfThumbnailProps {
  doc: PdfDoc;
  pageNum: number;
  isActive: boolean;
  onClick: () => void;
}

function PdfThumbnail({ doc, pageNum, isActive, onClick }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      try {
        const page = await doc.getPage(pageNum);
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = THUMB_WIDTH / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        await renderTask.promise;
      } catch {
        // Cancellation throws; ignore.
      }
    })();
    return () => {
      cancelled = true;
      if (renderTask) {
        try { renderTask.cancel(); } catch { /* noop */ }
      }
    };
  }, [doc, pageNum]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`block rounded border-2 overflow-hidden transition-colors ${
        isActive
          ? "border-primary ring-2 ring-primary/30"
          : "border-border hover:border-primary/60"
      }`}
      data-testid={`pdf-pager-thumb-${pageNum}`}
      aria-label={`Go to page ${pageNum}`}
      aria-current={isActive ? "page" : undefined}
    >
      <canvas ref={canvasRef} className="block bg-white" />
      <div className="text-[10px] text-center text-muted-foreground py-0.5">
        {pageNum}
      </div>
    </button>
  );
}
