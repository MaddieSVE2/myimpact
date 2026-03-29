import { useState } from "react";
import { MessageSquare, Send, CheckCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Feedback() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          name: name.trim() || null,
          email: email.trim() || null,
          pageUrl: "/feedback",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to send feedback");
      }

      setSuccess(true);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      <div className="flex items-center gap-3 mb-8">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(240,97,39,0.10)" }}
        >
          <MessageSquare className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Share feedback</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Questions, ideas, bug reports — we'd love to hear from you.
          </p>
        </div>
      </div>

      {success ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <CheckCircle className="w-12 h-12 text-green-500" aria-hidden="true" />
          <h2 className="text-xl font-bold text-foreground">Thank you!</h2>
          <p className="text-muted-foreground max-w-sm">
            Your message has been received. We read every piece of feedback and it helps us make
            My Impact better.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 flex flex-col gap-1.5">
              <label htmlFor="feedback-name" className="text-sm font-medium text-foreground">
                Name <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                id="feedback-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="w-full text-sm border border-border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground bg-background placeholder:text-muted-foreground"
                maxLength={100}
                disabled={submitting}
                autoComplete="name"
              />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <label htmlFor="feedback-email" className="text-sm font-medium text-foreground">
                Email <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <input
                id="feedback-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full text-sm border border-border rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground bg-background placeholder:text-muted-foreground"
                maxLength={200}
                disabled={submitting}
                autoComplete="email"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="feedback-message" className="text-sm font-medium text-foreground">
              Message <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind — bugs, feature requests, general thoughts, anything goes."
              className="w-full text-sm border border-border rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 text-foreground bg-background placeholder:text-muted-foreground"
              rows={6}
              maxLength={5000}
              required
              disabled={submitting}
              aria-required="true"
            />
            <p className="text-xs text-muted-foreground text-right">
              {message.length} / 5000
            </p>
          </div>

          {error && (
            <div
              className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !message.trim()}
            className={cn(
              "flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-white transition-colors",
              submitting || !message.trim()
                ? "bg-primary/40 cursor-not-allowed"
                : "bg-primary hover:bg-primary/90"
            )}
          >
            <Send className="w-4 h-4" aria-hidden="true" />
            {submitting ? "Sending…" : "Send feedback"}
          </button>
        </form>
      )}
    </div>
  );
}
