import { useState, useEffect, useRef } from "react";
import { X, Copy, Check, Share2, Gift } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

interface InviteData {
  inviteCode: string;
  inviteUrl: string;
  sharedAt: string | null;
}

interface InviteModalProps {
  onClose: () => void;
}

export default function InviteModal({ onClose }: InviteModalProps) {
  const [data, setData] = useState<InviteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [usedShare, setUsedShare] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    fetch(`${BASE_URL}/api/user/invite`, { credentials: "include" })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const markUsed = async () => {
    if (usedShare) return;
    setUsedShare(true);
    try {
      await fetch(`${BASE_URL}/api/user/invite/use`, { method: "POST", credentials: "include" });
      await queryClient.invalidateQueries({ queryKey: ["user-invite"] });
    } catch {}
  };

  const handleCopy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data.inviteUrl);
    } catch {
      if (inputRef.current) {
        inputRef.current.select();
        document.execCommand("copy");
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    await markUsed();
  };

  const handleShare = async () => {
    if (!data) return;
    try {
      await navigator.share({
        title: "Join me on My Impact",
        text: "Track the social value of your volunteering and community contributions. Join me on My Impact!",
        url: data.inviteUrl,
      });
      await markUsed();
    } catch (err: unknown) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        await handleCopy();
      }
    }
  };

  const canNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm mx-auto p-6 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#F06127" }}>
              <Gift className="w-5 h-5 text-white" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Invite a friend</p>
              <p className="text-xs text-muted-foreground">Share My Impact with someone you know</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted/40 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
          Know someone making a difference in their community? Invite them to track their social value too. Share your personal link below.
        </p>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : data ? (
          <>
            <div className="flex gap-2 mb-3">
              <input
                ref={inputRef}
                type="text"
                readOnly
                value={data.inviteUrl}
                className="flex-1 text-xs px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-foreground font-mono focus:outline-none"
                onClick={e => (e.target as HTMLInputElement).select()}
                aria-label="Your personal invite link"
              />
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium text-white transition-colors shrink-0"
                style={{ background: "#F06127" }}
                aria-label="Copy invite link"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            {canNativeShare && (
              <button
                onClick={handleShare}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-border text-foreground hover:bg-muted/30 transition-colors"
              >
                <Share2 className="w-4 h-4 text-muted-foreground" />
                Share via...
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">Could not load your invite link. Please try again.</p>
        )}
      </div>
    </div>
  );
}
