import { useState, useRef, useEffect, useCallback } from "react";
import { Send, ChevronRight, Sparkles, X } from "lucide-react";
import { useWizard } from "@/lib/wizard-context";
import { useSidekick } from "@/lib/sidekick-context";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const QUICK_ACTIONS = [
  "What does my social value score mean?",
  "How can I increase my impact?",
  "Which SDGs am I helping?",
  "Help me write about my impact for my UCAS personal statement",
];

export function Sidekick() {
  const { open, setOpen } = useSidekick();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { result } = useWizard();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const buildContext = () => {
    const ctx: Record<string, unknown> = {};
    if (result?.totalValue) ctx.totalValue = result.totalValue;
    if (result?.breakdown?.length) ctx.activities = result.breakdown.map((b) => b.name);
    if (result?.sdgs?.length) ctx.sdgs = result.sdgs.map((s) => s.name);
    return Object.keys(ctx).length ? ctx : undefined;
  };

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || streaming) return;

      const newMessages: Message[] = [...messages, { role: "user", content: userText }];
      setMessages(newMessages);
      setInput("");
      setStreaming(true);

      const assistantIndex = newMessages.length;
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      abortRef.current = new AbortController();

      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const res = await fetch(`${base}/api/sidekick/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newMessages, context: buildContext() }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) throw new Error("Request failed");

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assembled = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                assembled += data.content;
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[assistantIndex] = { role: "assistant", content: assembled };
                  return updated;
                });
              }
              if (data.done) break;
            } catch {
              // ignore parse errors on partial chunks
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            updated[assistantIndex] = {
              role: "assistant",
              content: "Sorry, I couldn't get a response. Please try again.",
            };
            return updated;
          });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, streaming, result]
  );

  const handleSubmit = () => sendMessage(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleClear = () => {
    if (streaming) abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
  };

  const chatBody = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 min-h-[60px]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "#FFF0E8" }}>
            <Sparkles className="w-4 h-4" style={{ color: "#F06127" }} />
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground leading-none">Sidekick</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">AI Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={handleClear}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Clear conversation"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4 md:hidden" />
            <ChevronRight className="w-4 h-4 hidden md:block" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {messages.length === 0 ? (
          <>
            <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: "#FFF7F3" }}>
              <p className="font-medium text-foreground mb-1">Hey! I'm Sidekick 👋</p>
              <p className="text-muted-foreground text-[13px] leading-relaxed">
                I can help you understand your social value, discover new ways to make an impact, and explain how everything is calculated.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Quick questions</p>
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action}
                  onClick={() => sendMessage(action)}
                  className="text-left px-3.5 py-2.5 rounded-lg border border-border text-[13px] text-foreground hover:border-[#F06127] hover:bg-[#FFF7F3] transition-all"
                >
                  {action}
                </button>
              ))}
            </div>
            <div className="mt-auto pt-2 text-[11px] text-muted-foreground leading-relaxed">
              Powered by <span className="font-medium text-foreground">the Social Value Engine</span>. AI responses are for guidance only.
            </div>
          </>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
                    msg.role === "user" ? "text-white rounded-br-sm" : "bg-[#f4f4f5] text-foreground rounded-bl-sm"
                  )}
                  style={msg.role === "user" ? { backgroundColor: "#F06127" } : undefined}
                >
                  {msg.content || <span className="text-muted-foreground animate-pulse">Thinking…</span>}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-4 py-3.5 border-t border-border bg-white shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Sidekick anything…"
            disabled={streaming}
            className="flex-1 resize-none rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[#F06127] transition-colors min-h-[42px] max-h-[120px] leading-snug disabled:opacity-50"
            style={{ fontFamily: "inherit" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || streaming}
            className="w-[42px] h-[42px] rounded-xl flex items-center justify-center shrink-0 text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "#F06127" }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── Desktop: right sidebar (hidden on mobile) ── */}
      <div
        className="hidden md:flex fixed top-0 right-0 h-screen z-50 flex-col bg-white transition-all duration-300 ease-in-out"
        style={{
          width: open ? 380 : 48,
          borderLeft: "1px solid #e5e7eb",
          boxShadow: open ? "-4px 0 24px rgba(0,0,0,0.07)" : "none",
        }}
      >
        {open ? (
          chatBody
        ) : (
          <div
            onClick={() => setOpen(true)}
            className="flex-1 flex items-center justify-center cursor-pointer hover:bg-[#E8633A] transition-colors pt-16 select-none group"
            title="Open Sidekick AI"
          >
            <span
              className="text-[11px] font-semibold text-muted-foreground group-hover:text-white tracking-[1.5px] uppercase transition-colors"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              SIDEKICK
            </span>
          </div>
        )}
      </div>

      {/* ── Mobile: full-screen overlay (hidden on md+) ── */}
      {open && (
        <div className="md:hidden fixed inset-0 z-[60] bg-white flex flex-col">
          {chatBody}
        </div>
      )}
    </>
  );
}
