import { useState } from "react";
import { useLocation } from "wouter";
import { X, MessageSquare, Send, CheckCircle } from "lucide-react";
import { useFeedback } from "@/lib/feedback-context";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export function FeedbackWidget() {
  const { feedbackMode, setFeedbackMode } = useFeedback();
  const { user } = useAuth();
  const [location] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!feedbackMode) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${BASE_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: message.trim(),
          pageUrl: location,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to send feedback");
      }

      setSuccess(true);
      setMessage("");

      setTimeout(() => {
        setSuccess(false);
        setExpanded(false);
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-2"
      aria-live="polite"
    >
      {expanded && (
        <div className="w-80 bg-white rounded-2xl shadow-2xl border border-border overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ background: "#213547" }}
          >
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-white/80" aria-hidden="true" />
              <span className="text-sm font-semibold text-white">Share feedback</span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              aria-label="Close feedback form"
            >
              <X className="w-4 h-4 text-white/70" aria-hidden="true" />
            </button>
          </div>

          {success ? (
            <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
              <CheckCircle className="w-8 h-8 text-green-500" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">Thanks for the feedback!</p>
              <p className="text-xs text-muted-foreground">We really appreciate it.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Page: <span className="font-medium text-foreground">{location || "/"}</span>
                </p>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="What's on your mind? Any issues, ideas, or general thoughts..."
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground bg-background placeholder:text-muted-foreground"
                  rows={4}
                  maxLength={2000}
                  aria-label="Feedback message"
                  disabled={submitting}
                  autoFocus
                />
                {error && (
                  <p className="text-xs text-red-600 mt-1" role="alert">{error}</p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setFeedbackMode(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Turn off feedback mode
                </button>
                <button
                  type="submit"
                  disabled={submitting || !message.trim()}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-colors",
                    submitting || !message.trim()
                      ? "bg-primary/40 cursor-not-allowed"
                      : "bg-primary hover:bg-primary/90"
                  )}
                  aria-label="Submit feedback"
                >
                  <Send className="w-3.5 h-3.5" aria-hidden="true" />
                  {submitting ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <button
        onClick={() => setExpanded(v => !v)}
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg font-semibold text-sm text-white transition-all hover:-translate-y-0.5",
          expanded ? "bg-[#213547]" : "bg-primary"
        )}
        aria-label={expanded ? "Close feedback widget" : "Open feedback widget"}
        aria-expanded={expanded}
      >
        <MessageSquare className="w-4 h-4" aria-hidden="true" />
        Feedback
      </button>
    </div>
  );
}
