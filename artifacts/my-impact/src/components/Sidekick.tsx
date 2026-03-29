import { useState, useRef, useEffect, useCallback } from "react";
import { Send, ChevronRight, Sparkles, X, Bot } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useWizard } from "@/lib/wizard-context";
import { useSidekick } from "@/lib/sidekick-context";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

function useMyOrgMembership(enabled: boolean) {
  return useQuery<{ org: { id: string; name: string; type: string } | null }>({
    queryKey: ["my-org"],
    enabled,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/org/my`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 60_000,
  });
}

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
    "How do I explain our impact figures to funders?",
    "How do I get volunteers to start logging?",
    "What does the organisation dashboard actually show?",
    "How do I respond if a trustee questions the accuracy of the figures?",
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

function normalise(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ");
}

const INSTANT_ANSWERS: { patterns: string[]; answer: string }[] = [
  {
    patterns: ["what is my impact", "what is my impact app", "what does my impact do"],
    answer:
      "My Impact helps you see the difference you make. Whether you volunteer, fundraise, mentor, or simply show up for your community, your actions have real value. My Impact turns that value into something you can see, share, and be proud of.",
  },
  {
    patterns: ["what is social value", "what does social value mean", "explain social value"],
    answer:
      "Social value is a way of measuring the broader benefit that people, organisations, and communities create beyond just money. My Impact uses accredited research from the Social Value Engine to translate your activities into a pound figure, based on the genuine difference those actions make to the people and communities around you.",
  },
  {
    patterns: [
      "how does the calculation work",
      "how is my social value calculated",
      "how is my score calculated",
      "how does the scoring work",
      "how is the score calculated",
    ],
    answer:
      "My Impact matches your activities to outcomes and uses the Social Value Engine's research database to assign a pound value to each one. The SVE is an accredited platform used across the public and third sectors for over a decade. Values are adjusted to reflect how much of the difference is genuinely down to you, rather than something that would have happened anyway.",
  },
  {
    patterns: [
      "what does my score actually mean",
      "what does my score mean",
      "what does the score mean",
      "what does my number mean",
    ],
    answer:
      "Your score is a personal running total of the social value you have created through your logged activities. A higher score simply means you have done more or been active for longer. There is no benchmark to hit and no one to compete with. The most meaningful comparison is your own score over time as it grows.",
  },
  {
    patterns: [
      "is this free to use",
      "is my impact free",
      "is it free",
      "does it cost anything",
      "how much does it cost",
      "is there a cost",
    ],
    answer: "Yes, My Impact is completely free for individuals to use.",
  },
  {
    patterns: [
      "who can see my score",
      "who can see my data",
      "is my score private",
      "is my data private",
      "who sees my information",
    ],
    answer:
      "Only you can see your score and activity detail, unless you choose to share it. If you are part of an organisation, the organisation dashboard shows aggregated data only, not your individual activities or score.",
  },
  {
    patterns: [
      "is my data shared",
      "do you share my data",
      "what do you do with my data",
      "is my data sold",
      "data privacy",
    ],
    answer: "No. Your data is not sold or shared with third parties. It is used only to calculate and display your social value within My Impact.",
  },
  {
    patterns: [
      "does unpaid caring count",
      "does caring count",
      "does looking after someone count",
      "does childcare count",
      "does eldercare count",
    ],
    answer:
      "Yes, absolutely. Caring is recognised as skilled, valuable work. Whether you look after a child, an elderly relative, or someone with additional needs, that contribution matters and can be logged in My Impact.",
  },
  {
    patterns: [
      "does informal volunteering count",
      "does it have to be through an organisation",
      "does it need to be official",
      "can i log unofficial volunteering",
    ],
    answer:
      "Yes. Informal volunteering counts. It does not have to be through a registered organisation. If you help out in your community, support a neighbour, or give your time in any way, it is worth logging.",
  },
  {
    patterns: [
      "can i log past activities",
      "can i add old activities",
      "can i backdate activities",
      "can i log things i did before",
      "can i add activities from before i joined",
    ],
    answer: "Yes. You can log activities from before you joined My Impact, so your full history of contribution is captured.",
  },
  {
    patterns: [
      "what if my activity isnt on the list",
      "what if my activity is not on the list",
      "my activity isnt listed",
      "i cant find my activity",
      "what if i cant find my activity",
    ],
    answer:
      "If your activity is not on the list, you can describe it in your own words. The AI activity mode will match it to the right activity type so your contribution is still captured and valued.",
  },
  {
    patterns: [
      "is my impact connected to social value engine",
      "is this connected to sve",
      "does this use social value engine",
      "what is the social value engine",
    ],
    answer:
      "Yes. My Impact's calculation methodology is built on the Social Value Engine's accredited research database. The SVE has been used across the public and third sectors for over a decade to measure the real value of social contributions.",
  },
];

function getInstantAnswer(text: string): string | null {
  const normalised = normalise(text);
  for (const entry of INSTANT_ANSWERS) {
    for (const pattern of entry.patterns) {
      if (normalised === pattern) {
        return entry.answer;
      }
    }
  }
  return null;
}

export function Sidekick() {
  const { open, setOpen } = useSidekick();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { result, interests, careerBreak, situations } = useWizard();
  const situation = situations[0] ?? null;
  const [location] = useLocation();
  const { isLoggedIn } = useAuth();
  const { data: orgData } = useMyOrgMembership(isLoggedIn);
  const isOrgManager = !!(orgData?.org);
  const isOnOrgPage = location === "/org" || location.startsWith("/org/");

  const baseQuickActions = PAGE_QUICK_ACTIONS[location] ?? DEFAULT_QUICK_ACTIONS;
  const quickActions = (() => {
    if (isOnOrgPage && isOrgManager) {
      return [
        "How do I explain our impact figures to funders?",
        "How do I get volunteers to start logging?",
        "What does the organisation dashboard actually show?",
        "How do I respond if a trustee questions the accuracy of the figures?",
      ];
    }
    if (location === "/results") {
      const extras: string[] = [];
      if (interests.includes("military")) {
        extras.push("Help me translate my forces service into CV bullet points");
        extras.push("How do I explain my military background to a civilian employer?");
      }
      if (careerBreak) {
        extras.push("Help me write about my career break on my CV positively");
        extras.push("Draft an interview answer about my gap in employment");
      }
      if (situation === "apprenticeship") {
        extras.push("Help me write a supporting statement paragraph for my apprenticeship");
        extras.push("Will this help me get an apprenticeship?");
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
    if (result?.activityBreakdowns?.length) ctx.activities = result.activityBreakdowns.map((b: { activityName: string }) => b.activityName);
    if (result?.sdgBreakdowns?.length) ctx.sdgs = result.sdgBreakdowns.map((s: { sdg: string }) => s.sdg);
    if (situation) ctx.situation = situation;
    const effectiveInterests = [...interests];
    if (isOrgManager && !effectiveInterests.includes("org_manager")) {
      effectiveInterests.push("org_manager");
    }
    if (effectiveInterests.length) ctx.interests = effectiveInterests;
    return Object.keys(ctx).length ? ctx : undefined;
  };

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || streaming) return;

      const newMessages: Message[] = [...messages, { role: "user", content: userText }];
      setMessages(newMessages);
      setInput("");

      const assistantIndex = newMessages.length;

      const instant = getInstantAnswer(userText);
      if (instant !== null) {
        setMessages((prev) => [...prev, { role: "assistant", content: instant }]);
        return;
      }

      setStreaming(true);
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

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let streamDone = false;

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") {
              streamDone = true;
              break;
            }
            try {
              const parsed = JSON.parse(raw) as { delta?: string; error?: string };
              if (parsed.error) {
                setMessages((prev) => {
                  const updated = [...prev];
                  if (!updated[assistantIndex]?.content) {
                    updated[assistantIndex] = {
                      role: "assistant",
                      content: "Sorry, I couldn't get a response. Please try again.",
                    };
                  }
                  return updated;
                });
                streamDone = true;
                break;
              }
              if (parsed.delta) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[assistantIndex] = {
                    role: "assistant",
                    content: (updated[assistantIndex]?.content ?? "") + parsed.delta,
                  };
                  return updated;
                });
              }
            } catch {
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
    [messages, streaming, result, interests, situations, isOrgManager]
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
              className="min-w-[44px] min-h-[44px] rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="min-w-[44px] min-h-[44px] rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
            aria-label="Close Sidekick"
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
                  {msg.content || (
                    <span className="flex items-center gap-1 py-0.5" aria-label="Assistant is typing">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-2 h-2 rounded-full bg-gray-500 inline-block"
                          style={{
                            animation: "sidekick-bounce 1.2s ease-in-out infinite",
                            animationDelay: `${i * 0.2}s`,
                          }}
                        />
                      ))}
                    </span>
                  )}
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
            className="flex-1 resize-none rounded-xl border border-border bg-white px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[#F06127] transition-colors min-h-[44px] max-h-[120px] leading-snug disabled:opacity-50"
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
            className="w-[44px] h-[44px] rounded-xl flex items-center justify-center shrink-0 text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: "#F06127" }}
            aria-label="Send message"
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
        className="hidden lg:flex sticky top-0 h-screen flex-col bg-white transition-all duration-300 ease-in-out flex-shrink-0"
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
