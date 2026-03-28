import { useState, useRef, useEffect, useCallback } from "react";
import { Send, ChevronRight, Sparkles, X, Bot } from "lucide-react";
import { useLocation } from "wouter";
import { useWizard } from "@/lib/wizard-context";
import { useSidekick } from "@/lib/sidekick-context";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const PAGE_QUICK_ACTIONS: Record<string, string[]> = {
  "/wizard/actions": [
    "What counts as a meaningful action?",
    "How are these activities converted to social value?",
    "What's the difference between volunteering and paid work?",
    "Which activities have the biggest impact?",
  ],
  "/wizard/activities": [
    "Which activities create the most social value?",
    "How is volunteering valued in pounds?",
    "What if my activity isn't on the list?",
    "How do environmental activities get measured?",
  ],
  "/wizard/contributions": [
    "How are donations valued?",
    "Is giving time worth more than donating money?",
    "Which SDGs do contributions link to?",
    "What counts as a financial contribution here?",
  ],
  "/results": [
    "What does my score actually mean?",
    "How can I increase my social value?",
    "Help me write a UCAS paragraph about my impact",
    "Which SDGs am I contributing to?",
  ],
  "/suggestions": [
    "How do I find volunteering near me?",
    "What is DofE and how do I get involved?",
    "Help me explain my impact on my CV",
    "Which causes might suit my interests?",
  ],
  "/history": [
    "How do I grow my impact over time?",
    "Help me summarise my impact history for a job application",
    "What trends should I look for in my history?",
    "How do I use this for a UCAS personal statement?",
  ],
  "/journal": [
    "What makes a good impact reflection?",
    "Help me write a reflection on my volunteering",
    "What should I include in an impact journal entry?",
    "How can I use my journal for a UCAS statement?",
  ],
  "/badges": [
    "What do these badges mean for employers?",
    "Help me write a LinkedIn post about my impact",
    "How do I earn more badges?",
    "Can I use my badges in a personal statement?",
  ],
  "/org": [
    "How does an organisation dashboard work?",
    "What metrics matter most for a funding bid?",
    "How do we grow our organisation's social value?",
    "How should we present this data to trustees?",
  ],
  "/org/register": [
    "What are the benefits of registering an organisation?",
    "How does the invite code system work?",
    "What data does the dashboard show?",
    "Is the data anonymous?",
  ],
  "/": [
    "What is My Impact?",
    "What do you do with my data?",
    "How does the calculation work?",
    "Is this free to use?",
  ],
};

const DEFAULT_QUICK_ACTIONS = [
  "What is social value?",
  "How can I increase my impact?",
  "Help me write a UCAS paragraph about my impact",
  "What SDGs am I helping?",
];

export function Sidekick() {
  const { open, setOpen } = useSidekick();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { result, interests } = useWizard();
  const [location] = useLocation();

  const baseQuickActions = PAGE_QUICK_ACTIONS[location] ?? DEFAULT_QUICK_ACTIONS;
  const quickActions = (() => {
    if (location === "/results") {
      const extras: string[] = [];
      if (interests.includes("military")) {
        extras.push("Help me translate my forces service into CV bullet points");
        extras.push("How do I explain my military background to a civilian employer?");
      }
      if (interests.includes("career_break")) {
        extras.push("Help me write about my career break on my CV positively");
        extras.push("Draft an interview answer about my gap in employment");
      }
      return [...extras, ...baseQuickActions].slice(0, 4);
    }
    return baseQuickActions;
  })();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const buildContext = () => {
    const ctx: Record<string, unknown> = {};
    if (result?.totalValue) ctx.totalValue = result.totalValue;
    if (result?.activityBreakdowns?.length) ctx.activities = result.activityBreakdowns.map((b) => b.activityName);
    if (result?.sdgBreakdowns?.length) ctx.sdgs = result.sdgBreakdowns.map((s) => s.sdg);
    if (interests.length) ctx.interests = interests;
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

        const data = await res.json() as { content?: string; error?: string };
        const content = data.content ?? "";
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIndex] = { role: "assistant", content };
          return updated;
        });
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
    [messages, streaming, result, interests]
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
              {quickActions.map((action) => (
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
        className="hidden lg:flex fixed top-0 right-0 h-screen z-50 flex-col bg-white transition-all duration-300 ease-in-out"
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
            className="flex-1 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors pt-16 select-none group"
            style={{ backgroundColor: "#F06127" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#F06127")}
            title="Open Sidekick AI"
          >
            <Bot className="w-5 h-5 text-white group-hover:text-[#F06127] transition-colors" />
            <span
              className="text-[11px] font-semibold tracking-[1.5px] uppercase transition-colors text-white group-hover:text-[#F06127]"
              style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
            >
              SIDEKICK
            </span>
          </div>
        )}
      </div>

      {/* ── Mobile: full-screen overlay (hidden on md+) ── */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-[60] bg-white flex flex-col">
          {chatBody}
        </div>
      )}
    </>
  );
}
