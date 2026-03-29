import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Badge } from "@/lib/badges";
import BadgeShareCard, { CARD_SIZES } from "./BadgeShareCard";
import { X, Download, Linkedin, Twitter } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface BadgeShareModalProps {
  badge: Badge;
  totalValue: number;
  onClose: () => void;
}

type Format = "landscape" | "portrait";

function FacebookIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 4.99 3.657 9.128 8.438 9.878v-6.987h-2.54V12.07h2.54V9.845c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12.07h2.773l-.443 2.89h-2.33v6.988C20.343 21.2 24 17.062 24 12.073z" />
    </svg>
  );
}

const SCALE = 0.38;

export default function BadgeShareModal({ badge, totalValue, onClose }: BadgeShareModalProps) {
  const [format, setFormat] = useState<Format>("landscape");
  const [isGenerating, setIsGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const shareUrl = window.location.origin;
  const shareText = `I've just earned the ${badge.name} badge on My Impact. I've created an estimated ${formatCurrency(totalValue)} of social value. Find out what difference you make at ${shareUrl}`;

  const captureCard = async (): Promise<HTMLCanvasElement | null> => {
    if (!cardRef.current) return null;
    const { width, height } = CARD_SIZES[format];
    const canvas = await html2canvas(cardRef.current, {
      width,
      height,
      scale: 2,
      useCORS: true,
      backgroundColor: "#f5f0e8",
      logging: false,
    });
    return canvas;
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const canvas = await captureCard();
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `${badge.name.toLowerCase().replace(/\s+/g, "-")}-badge.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareLinkedIn = () => {
    const url = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=600");
  };

  const handleShareTwitter = () => {
    const twitterText = `I've just earned the ${badge.name} badge on My Impact. I've created an estimated ${formatCurrency(totalValue)} of social value. Find out what difference you make at`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
  };

  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer,width=600,height=500");
  };

  const { width, height } = CARD_SIZES[format];
  const previewWidth = width * SCALE;
  const previewHeight = height * SCALE;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(26,46,58,0.6)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-[#1a2e3a]">Share your badge</h2>
            <p className="text-xs text-gray-500 mt-0.5">{badge.emoji} {badge.name}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Format toggle */}
        <div className="flex gap-2 px-6 pt-4">
          <button
            onClick={() => setFormat("landscape")}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              format === "landscape"
                ? "bg-[#e8622a] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Landscape (LinkedIn / Twitter)
          </button>
          <button
            onClick={() => setFormat("portrait")}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
              format === "portrait"
                ? "bg-[#e8622a] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Portrait (Instagram)
          </button>
        </div>

        {/* Card preview */}
        <div className="px-6 pt-4 pb-2 flex justify-center">
          <div
            style={{
              width: previewWidth,
              height: previewHeight,
              overflow: "hidden",
              borderRadius: 12,
              boxShadow: "0 4px 24px rgba(26,46,58,0.12)",
              flexShrink: 0,
            }}
          >
            <div style={{ transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
              <BadgeShareCard
                badge={badge}
                totalValue={totalValue}
                format={format}
                appUrl={window.location.hostname}
              />
            </div>
          </div>
        </div>

        {/* Share text preview */}
        <div className="px-6 py-3">
          <p className="text-xs text-gray-500 mb-1 font-medium">Pre-populated share text</p>
          <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed border border-gray-100">
            {shareText}
          </p>
        </div>

        {/* Action buttons */}
        <div className="px-6 pb-6 grid grid-cols-2 gap-2">
          <button
            onClick={handleShareLinkedIn}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#0077b5" }}
          >
            <Linkedin size={16} />
            LinkedIn
          </button>
          <button
            onClick={handleShareTwitter}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#000000" }}
          >
            <Twitter size={16} />
            Twitter / X
          </button>
          <button
            onClick={handleShareFacebook}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#1877f2" }}
          >
            <FacebookIcon size={16} />
            Facebook
          </button>
          <button
            onClick={handleDownload}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
            style={{ color: "#1a2e3a" }}
          >
            <Download size={16} />
            {isGenerating ? "Generating…" : "Download PNG"}
          </button>
        </div>
      </div>

      {/* Off-screen card for html2canvas capture */}
      <div
        style={{
          position: "fixed",
          left: -9999,
          top: -9999,
          pointerEvents: "none",
        }}
        aria-hidden="true"
      >
        <BadgeShareCard ref={cardRef} badge={badge} totalValue={totalValue} format={format} appUrl={window.location.hostname} />
      </div>
    </div>
  );
}
