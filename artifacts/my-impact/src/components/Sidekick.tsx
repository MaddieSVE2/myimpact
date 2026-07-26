import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, ChevronRight, Sparkles, X, Bot, Copy, RefreshCw, RotateCcw, Check, MessageSquare, LayoutGrid, Mic, Square, Volume2, VolumeX, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useWizard } from "@/lib/wizard-context";
import { useSidekick } from "@/lib/sidekick-context";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/i18n";
import { cn } from "@/lib/utils";
import { ANALYTICS_EVENTS, track } from "@/lib/analytics";
import {
  SIDEKICK_TEMPLATES,
  SIDEKICK_CATEGORY_LABELS,
  buildRegeneratePrompt,
  resolvePersona,
  templatesForPersona,
  type SidekickTemplate,
  type SidekickTemplateCategory,
  type SidekickUserContext,
} from "@/lib/sidekick-templates";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

function useMyOrgMembership(enabled: boolean) {
  return useQuery<{ org: { id: string; name: string; type: string; role?: string; aiSidekickEnabled?: boolean } | null }>({
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
  /**
   * If this assistant message was generated from a template, store the
   * original template id and the prompt that produced it so we can offer
   * "regenerate with a different angle".
   */
  templateId?: string;
  templatePrompt?: string;
  regenerateAttempt?: number;
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
  "/milestones": [
    "What do these milestones mean for employers?",
    "Help me write a LinkedIn post about my impact",
    "How do I earn more milestones?",
    "Can I use my milestones in a personal statement?",
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

type SidekickTab = "chat" | "templates";
type VoiceState = "idle" | "recording" | "transcribing" | "speaking";

const VOICE_SUPPORTED =
  typeof window !== "undefined" &&
  typeof navigator !== "undefined" &&
  !!navigator.mediaDevices &&
  typeof navigator.mediaDevices.getUserMedia === "function" &&
  typeof window.MediaRecorder !== "undefined";

const RECORDER_PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
];

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mt of RECORDER_PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return undefined;
}

const AI_DISABLED_DISMISSED_KEY_PREFIX = "myimpact:aiDisabledByOrgNoticeDismissed";

function aiDisabledDismissedKey(userId?: string | null) {
  return userId
    ? `${AI_DISABLED_DISMISSED_KEY_PREFIX}:${userId}`
    : AI_DISABLED_DISMISSED_KEY_PREFIX;
}

function useAiDisabledNoticeDismissed(userId?: string | null) {
  const storageKey = aiDisabledDismissedKey(userId);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setDismissed(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);
  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {}
    setDismissed(true);
  }, [storageKey]);
  return { dismissed, dismiss };
}

function AiDisabledByOrgRail({ userId }: { userId?: string | null }) {
  const { dismissed, dismiss } = useAiDisabledNoticeDismissed(userId);
  if (dismissed) return null;
  return (
    <div
      className="hidden lg:flex h-full flex-col items-center justify-start px-2 gap-3 bg-white flex-shrink-0"
      style={{ width: 48, borderLeft: "1px solid #e5e7eb" }}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex flex-col items-center gap-2 px-1 py-3 rounded-lg"
        style={{ backgroundColor: "#F3F4F6", color: "#4B5563" }}
        title="AI features are turned off by your organisation."
      >
        <Bot className="w-4 h-4" aria-hidden="true" />
        <span
          className="text-[10px] font-semibold tracking-[1.5px] uppercase"
          style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
        >
          AI off · org
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="mt-1 p-1 rounded hover:bg-black/5"
          aria-label="Dismiss notice that AI features are turned off by your organisation"
        >
          <X className="w-3 h-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

export function Sidekick() {
  const { open, setOpen } = useSidekick();
  const [tab, setTab] = useState<SidekickTab>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const { toast } = useToast();
  // Tiered AI quota meter (anonymous: 10 q/day + 200k tokens/month;
  // signed-in: 50 q/day + 1.5M tokens/month). Refetched after every send
  // so the header counter stays in sync with the server.
  const quotaQuery = useQuery<{
    quota: {
      questionsLeft: number;
      tokensLeft: number;
      dailyLimit: number;
      monthlyTokenLimit: number;
      questionsUsedToday: number;
      tokensUsedThisMonth: number;
      isAuthenticated: boolean;
    };
  }>({
    queryKey: ["sidekick-quota"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/sidekick/quota`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load quota");
      return res.json();
    },
    staleTime: 30_000,
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  // Brief client-side cooldown applied after a 429 from the chat route,
  // so the user can't immediately re-fire the same request and get the
  // same toast back-to-back. Cleared by a setTimeout below.
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const inputDisabled = streaming || Date.now() < cooldownUntil;
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { result, interests, careerBreak, situations } = useWizard();
  const situation = situations[0] ?? null;
  const [location] = useLocation();
  const { isLoggedIn, user } = useAuth();
  const { locale } = useLocale();
  const { data: orgData } = useMyOrgMembership(isLoggedIn);
  const isOrgManager = !!(orgData?.org);
  // When the user belongs to an org whose manager has disabled AI features,
  // replace the Sidekick with a small dismissible "AI off" notice (see
  // AiDisabledByOrgRail) so members understand why the chat is missing
  // instead of it silently disappearing. Individuals (no org) always see
  // the full Sidekick.
  const aiDisabledByOrg = !!orgData?.org && orgData.org.aiSidekickEnabled === false;
  const isOnOrgPage = location === "/org" || location.startsWith("/org/");

  // Voice mode: a per-session toggle that defaults to the user's saved
  // preference. The Settings page persists the default; the in-panel toggle
  // only affects the current session.
  const savedVoiceEnabled = user?.voiceEnabled ?? false;
  const voicePersona = user?.voicePersona ?? "alloy";
  const [voiceMode, setVoiceMode] = useState<boolean>(savedVoiceEnabled);
  const voiceModeTouched = useRef(false);
  useEffect(() => {
    if (!voiceModeTouched.current) {
      setVoiceMode(savedVoiceEnabled);
    }
  }, [savedVoiceEnabled]);
  const toggleVoiceMode = useCallback(() => {
    voiceModeTouched.current = true;
    setVoiceMode((v) => !v);
  }, []);

  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderMimeRef = useRef<string | undefined>(undefined);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenIndexRef = useRef<number>(-1);

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

  const persona = useMemo(
    () =>
      resolvePersona({
        interests,
        situations,
        careerBreak,
        isOrgManager,
      }),
    [interests, situations, careerBreak, isOrgManager]
  );

  const templateUserContext = useMemo<SidekickUserContext>(() => {
    const breakdowns = result?.activityBreakdowns ?? [];
    const sorted = [...breakdowns].sort((a, b) => (b.impactValue ?? 0) - (a.impactValue ?? 0));
    const top = sorted[0]?.activityName;
    const recent = sorted.slice(0, 3).map((b) => b.activityName).filter(Boolean);
    const sdgs = result?.sdgBreakdowns ?? [];
    const topSdg = sdgs[0]?.sdg;
    return {
      persona,
      totalValue: result?.totalValue,
      totalHours: result?.totalHours,
      topActivity: top,
      recentActivities: recent.length > 0 ? recent : undefined,
      topSdg,
    };
  }, [persona, result]);

  const visibleTemplates = useMemo(() => templatesForPersona(persona), [persona]);

  const groupedTemplates = useMemo(() => {
    const groups = new Map<SidekickTemplateCategory, SidekickTemplate[]>();
    for (const t of visibleTemplates) {
      const arr = groups.get(t.category) ?? [];
      arr.push(t);
      groups.set(t.category, arr);
    }
    return groups;
  }, [visibleTemplates]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Drive a per-second "Thinking… Ns" counter while we're waiting on the
  // model. Resets to zero whenever streaming ends so the next request
  // starts from scratch.
  useEffect(() => {
    if (!streaming) {
      setThinkingSeconds(0);
      return;
    }
    setThinkingSeconds(0);
    const started = Date.now();
    const id = window.setInterval(() => {
      setThinkingSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [streaming]);

  const buildContext = () => {
    const ctx: Record<string, unknown> = {};
    if (result?.totalValue) ctx.totalValue = result.totalValue;
    if (result?.activityBreakdowns?.length) ctx.activities = result.activityBreakdowns.map((b: { activityName: string }) => b.activityName);
    if (result?.sdgBreakdowns?.length) ctx.sdgs = result.sdgBreakdowns.map((s: { sdg: string }) => s.sdg);
    if (situation) ctx.situation = situation;
    const effectiveInterests = [...interests];
    if (isOrgManager && isOnOrgPage && !effectiveInterests.includes("org_manager")) {
      effectiveInterests.push("org_manager");
    }
    if (effectiveInterests.length) ctx.interests = effectiveInterests;
    return Object.keys(ctx).length ? ctx : undefined;
  };

  const sendMessage = useCallback(
    async (
      userText: string,
      meta?: { templateId?: string; templatePrompt?: string; regenerateAttempt?: number }
    ) => {
      if (!userText.trim() || streaming) return;

      const newMessages: Message[] = [...messages, { role: "user", content: userText }];
      setMessages(newMessages);
      setInput("");

      // Funnel analytics: count every user-initiated sidekick message.
      track(ANALYTICS_EVENTS.SIDEKICK_MESSAGE_SENT, {
        fromTemplate: !!meta?.templateId,
        isRegenerate: (meta?.regenerateAttempt ?? 0) > 0,
      });

      const assistantIndex = newMessages.length;

      // Instant answers only apply to free-typed quick questions, not template prompts.
      if (!meta?.templateId) {
        const instant = getInstantAnswer(userText);
        if (instant !== null) {
          setMessages((prev) => [...prev, { role: "assistant", content: instant }]);
          return;
        }
      }

      setStreaming(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          templateId: meta?.templateId,
          templatePrompt: meta?.templatePrompt,
          regenerateAttempt: meta?.regenerateAttempt,
        },
      ]);

      abortRef.current = new AbortController();

      try {
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        const res = await fetch(`${base}/api/sidekick/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newMessages.map(({ role, content }) => ({ role, content })), context: { ...buildContext(), locale } }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          // Surface server-provided quota / burst messages via toast so
          // the user understands why their message was rejected. The
          // assistant placeholder is rolled back so the UI doesn't show
          // an empty bubble next to the failure.
          let serverMessage = "";
          try {
            const data = await res.clone().json();
            serverMessage = (data?.message as string) || (data?.error as string) || "";
          } catch {
            serverMessage = await res.text().catch(() => "");
          }
          if (res.status === 429) {
            toast({
              title: "AI usage limit reached",
              description: serverMessage || "Please try again shortly.",
              variant: "destructive",
            });
            setMessages((prev) => prev.slice(0, assistantIndex));
            // Briefly disable the composer so the user can't immediately
            // re-fire the same request. 5 s is long enough to break the
            // burst loop without feeling broken.
            setCooldownUntil(Date.now() + 5000);
            setTimeout(() => setCooldownUntil(0), 5100);
            quotaQuery.refetch().catch(() => {});
            return;
          }
          throw new Error(serverMessage || `Request failed (${res.status})`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let streamDone = false;

        try {
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
                        ...updated[assistantIndex],
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
                      ...updated[assistantIndex],
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
        } finally {
          reader.cancel().catch(() => {});
        }

        // If the stream ended cleanly but the server never sent any text,
        // surface a visible message instead of leaving the user with a
        // stuck-looking spinner that just disappears.
        setMessages((prev) => {
          const updated = [...prev];
          const current = updated[assistantIndex];
          if (current && !current.content) {
            updated[assistantIndex] = {
              ...current,
              role: "assistant",
              content:
                "Sorry, I didn't manage to put a reply together that time. Please try again, or rephrase your question.",
            };
          }
          return updated;
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            const existing = updated[assistantIndex]?.content ?? "";
            updated[assistantIndex] = {
              ...updated[assistantIndex],
              role: "assistant",
              content: existing
                ? existing +
                  "\n\n(Sorry, the connection dropped before I finished. Please try again.)"
                : "Sorry, I couldn't get a response. Please check your connection and try again.",
            };
            return updated;
          });
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
        quotaQuery.refetch().catch(() => {});
      }
    },
    [messages, streaming, result, interests, situations, isOrgManager, isOnOrgPage, locale, toast, quotaQuery]
  );

  const fireTemplate = useCallback(
    (template: SidekickTemplate) => {
      const prompt = template.build(templateUserContext);
      setTab("chat");
      sendMessage(prompt, { templateId: template.id, templatePrompt: prompt, regenerateAttempt: 0 });
    },
    [templateUserContext, sendMessage]
  );

  const regenerateTemplate = useCallback(
    (msg: Message) => {
      if (!msg.templateId || !msg.templatePrompt) return;
      const nextAttempt = (msg.regenerateAttempt ?? 0) + 1;
      const newPrompt = buildRegeneratePrompt(msg.templatePrompt, nextAttempt - 1);
      sendMessage(newPrompt, {
        templateId: msg.templateId,
        templatePrompt: msg.templatePrompt,
        regenerateAttempt: nextAttempt,
      });
    },
    [sendMessage]
  );

  const handleCopy = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      window.setTimeout(() => {
        setCopiedIndex((v) => (v === index ? null : v));
      }, 1800);
    } catch {
      // ignore clipboard errors silently
    }
  }, []);

  const handleSubmit = () => sendMessage(input);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const stopAudioPlayback = useCallback(() => {
    const a = audioElRef.current;
    if (a) {
      try {
        a.pause();
        a.removeAttribute("src");
        a.load();
      } catch {
        // ignore
      }
    }
    if (voiceState === "speaking") setVoiceState("idle");
  }, [voiceState]);

  const handleClear = () => {
    if (streaming) abortRef.current?.abort();
    stopAudioPlayback();
    setMessages([]);
    setStreaming(false);
  };

  const startRecording = useCallback(async () => {
    if (!VOICE_SUPPORTED || streaming || voiceState !== "idle") return;
    setVoiceError(null);
    stopAudioPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecorderMimeType();
      recorderMimeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recorderChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setVoiceState("recording");
    } catch (err) {
      console.error("startRecording failed", err);
      setVoiceError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser to speak to Sidekick."
          : "Couldn't start recording. Please try again or type instead."
      );
      setVoiceState("idle");
    }
  }, [streaming, voiceState, stopAudioPlayback]);

  const stopRecordingAndSend = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setVoiceState("transcribing");
    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        const blobType = recorderMimeRef.current ?? recorder.mimeType ?? "audio/webm";
        const b = new Blob(recorderChunksRef.current, { type: blobType });
        recorder.stream.getTracks().forEach((t) => t.stop());
        resolve(b);
      };
      recorder.stop();
    });
    mediaRecorderRef.current = null;

    if (blob.size < 1000) {
      setVoiceState("idle");
      setVoiceError("That clip was too short to hear. Hold a little longer and try again.");
      return;
    }

    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/sidekick/transcribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      });
      const data = await res.json().catch(() => ({} as { transcript?: string; error?: string; code?: string }));
      if (!res.ok) {
        // The server returns specific codes with friendly copy:
        // 429 { code: "voice_cap_reached" }, 422 { code: "no_speech_detected" }
        // (mic muted / wrong input), 502 { code: "transcription_failed" }.
        // Pass the server message straight through so the user sees the
        // specific copy rather than a generic error.
        const code = (data as { code?: string }).code;
        const errMsg =
          (data as { error?: string }).error ??
          (code === "no_speech_detected"
            ? "We couldn't hear any speech — check your microphone and try again."
            : `Transcription failed (${res.status})`);
        throw new Error(errMsg);
      }
      const transcript = ((data as { transcript?: string }).transcript ?? "").trim();
      setVoiceState("idle");
      if (!transcript) {
        setVoiceError("I didn't catch that. Please try again.");
        return;
      }
      sendMessage(transcript);
    } catch (err) {
      console.error("transcribe failed", err);
      setVoiceState("idle");
      setVoiceError(err instanceof Error ? err.message : "Couldn't transcribe audio");
    }
  }, [sendMessage]);

  const handleMicClick = useCallback(() => {
    if (!VOICE_SUPPORTED) return;
    if (voiceState === "recording") {
      stopRecordingAndSend();
    } else if (voiceState === "idle") {
      startRecording();
    }
  }, [voiceState, startRecording, stopRecordingAndSend]);

  // Auto-play assistant replies when voice mode is on. We trigger on the
  // streaming completion of the last assistant message that we have not
  // spoken yet.
  useEffect(() => {
    if (!voiceMode) return;
    if (streaming) return;
    if (messages.length === 0) return;
    const lastIdx = messages.length - 1;
    const last = messages[lastIdx];
    if (!last || last.role !== "assistant") return;
    const text = (last.content ?? "").trim();
    if (!text) return;
    if (lastSpokenIndexRef.current >= lastIdx) return;
    lastSpokenIndexRef.current = lastIdx;

    let cancelled = false;
    (async () => {
      try {
        setVoiceState("speaking");
        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
        // The TTS endpoint caps at 1500 chars; clip very long replies.
        const speakable = text.length > 1500 ? text.slice(0, 1500) : text;
        const res = await fetch(`${base}/api/sidekick/speak`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: speakable, voice: voicePersona }),
        });
        if (!res.ok) {
          // Surface the friendly monthly-cap message in the panel so the
          // user understands why nothing is being read aloud.
          if (res.status === 429) {
            try {
              const data = await res.json();
              if (data?.code === "voice_cap_reached" && typeof data?.error === "string") {
                if (!cancelled) setVoiceError(data.error);
              }
            } catch {
              // ignore, fall through to the generic error
            }
          }
          throw new Error(`speak failed (${res.status})`);
        }
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        const blob = new Blob([buf], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        let audio = audioElRef.current;
        if (!audio) {
          audio = new Audio();
          audioElRef.current = audio;
        }
        audio.src = url;
        const onEnded = () => {
          URL.revokeObjectURL(url);
          if (!cancelled) setVoiceState("idle");
        };
        audio.onended = onEnded;
        audio.onerror = onEnded;
        try {
          await audio.play();
        } catch (err) {
          // Browsers may block autoplay until a user gesture has happened.
          // Fall back gracefully, the transcript is already on screen.
          console.warn("audio autoplay blocked", err);
          URL.revokeObjectURL(url);
          if (!cancelled) setVoiceState("idle");
        }
      } catch (err) {
        console.error("TTS failed", err);
        if (!cancelled) setVoiceState("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, streaming, voiceMode, voicePersona]);

  // Stop playback and recording when the panel is closed.
  useEffect(() => {
    if (!open) {
      stopAudioPlayback();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state === "recording") {
        try {
          recorder.stream.getTracks().forEach((t) => t.stop());
          recorder.stop();
        } catch {
          // ignore
        }
      }
      mediaRecorderRef.current = null;
      if (voiceState !== "idle") setVoiceState("idle");
    }
  }, [open, stopAudioPlayback, voiceState]);

  const templatesBody = (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: "#FFF7F3" }}>
        <p className="font-medium text-foreground mb-1">One-tap writing prompts</p>
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          Tap a card to draft something with your numbers. We'll personalise it to your situation and let you copy or try a different angle.
        </p>
      </div>

      {Array.from(groupedTemplates.entries()).map(([category, templates]) => (
        <div key={category} className="flex flex-col gap-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {SIDEKICK_CATEGORY_LABELS[category]}
          </p>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => fireTemplate(t)}
              disabled={streaming}
              className="text-left px-3.5 py-3 rounded-lg border border-border hover:border-[#F06127] hover:bg-[#FFF7F3] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid={`template-${t.id}`}
            >
              <p className="text-[13px] font-medium text-foreground leading-snug">{t.label}</p>
              <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{t.description}</p>
            </button>
          ))}
        </div>
      ))}

      <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
        Drafts use your current score and recent activity. AI responses are for guidance only.
      </p>
    </div>
  );

  const tabsBar = (
    <div className="flex border-b border-border shrink-0">
      <button
        onClick={() => setTab("chat")}
        className={cn(
          "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium border-b-2 transition-colors",
          tab === "chat"
            ? "border-[#F06127] text-[#F06127]"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
        data-testid="sidekick-tab-chat"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Chat
      </button>
      <button
        onClick={() => setTab("templates")}
        className={cn(
          "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium border-b-2 transition-colors",
          tab === "templates"
            ? "border-[#F06127] text-[#F06127]"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
        data-testid="sidekick-tab-templates"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Templates
      </button>
    </div>
  );

  const chatBody = (
    <>
      {/* Header */}
      <div className="flex flex-col px-5 py-4 border-b border-border shrink-0 gap-2">
       <div className="flex items-center justify-between min-h-[36px]">
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
          {VOICE_SUPPORTED && (
            <button
              onClick={() => {
                if (voiceMode) stopAudioPlayback();
                toggleVoiceMode();
              }}
              aria-pressed={voiceMode}
              className={cn(
                "min-w-[44px] min-h-[44px] rounded-md flex items-center justify-center transition-colors",
                voiceMode
                  ? "text-[#F06127] hover:bg-[#FFF0E8]"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              title={voiceMode ? "Voice replies on. Tap to mute." : "Voice replies off. Tap to read replies aloud."}
              aria-label={voiceMode ? "Turn voice replies off for this session" : "Turn voice replies on for this session"}
              data-testid="sidekick-voice-toggle"
            >
              {voiceMode ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={handleClear}
            disabled={messages.length === 0}
            className="min-w-[44px] min-h-[44px] rounded-md flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
            title="Reset conversation"
            aria-label="Reset conversation"
            data-testid="sidekick-reset"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
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
        {quotaQuery.data?.quota && (
          <div
            className="text-[11px] text-muted-foreground flex items-center justify-between gap-2"
            data-testid="sidekick-quota-meter"
          >
            <span>
              Questions today:{" "}
              <span className="font-medium text-foreground">
                {quotaQuery.data.quota.questionsUsedToday} / {quotaQuery.data.quota.dailyLimit}
              </span>
              <span className="hidden sm:inline">
                {" · "}
                Monthly AI usage:{" "}
                <span className="font-medium text-foreground">
                  {Math.round(quotaQuery.data.quota.tokensUsedThisMonth / 1000).toLocaleString("en-GB")}k
                  {" / "}
                  {Math.round(quotaQuery.data.quota.monthlyTokenLimit / 1000).toLocaleString("en-GB")}k tokens
                </span>
              </span>
            </span>
            {!quotaQuery.data.quota.isAuthenticated && (
              <span className="text-[10px] text-[#F06127] font-medium whitespace-nowrap">
                Sign in for higher limits
              </span>
            )}
          </div>
        )}
      </div>

      {tabsBar}

      {tab === "templates" ? (
        templatesBody
      ) : (
        <>
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
                {messages.map((msg, i) => {
                  const isAssistant = msg.role === "assistant";
                  const hasContent = !!msg.content;
                  const showTemplateActions =
                    isAssistant && hasContent && !!msg.templateId && !streaming;
                  return (
                    <div key={i} className={cn("flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                      <div
                        className={cn(
                          "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap",
                          msg.role === "user" ? "text-white rounded-br-sm" : "bg-[#f4f4f5] text-foreground rounded-bl-sm"
                        )}
                        style={msg.role === "user" ? { backgroundColor: "#F06127" } : undefined}
                      >
                        {msg.content || (
                          <span
                            className="flex items-center gap-2 py-0.5 text-[12px] text-muted-foreground"
                            aria-label="Assistant is thinking"
                            data-testid="sidekick-thinking"
                          >
                            <span className="flex items-center gap-1">
                              {[0, 1, 2].map((dotIdx) => (
                                <span
                                  key={dotIdx}
                                  className="w-2 h-2 rounded-full bg-gray-500 inline-block"
                                  style={{
                                    animation: "sidekick-bounce 1.2s ease-in-out infinite",
                                    animationDelay: `${dotIdx * 0.2}s`,
                                  }}
                                />
                              ))}
                            </span>
                            <span>
                              Thinking…{thinkingSeconds > 0 ? ` ${thinkingSeconds}s` : ""}
                              {thinkingSeconds >= 20 && thinkingSeconds < 60
                                ? " (still working on it)"
                                : ""}
                              {thinkingSeconds >= 60 ? " (this one's a long one)" : ""}
                            </span>
                          </span>
                        )}
                      </div>
                      {isAssistant && hasContent && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <button
                            onClick={() => handleCopy(msg.content, i)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            aria-label="Copy reply"
                            data-testid={`sidekick-copy-${i}`}
                          >
                            {copiedIndex === i ? (
                              <>
                                <Check className="w-3 h-3" /> Copied
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> Copy
                              </>
                            )}
                          </button>
                          {showTemplateActions && (
                            <button
                              onClick={() => regenerateTemplate(msg)}
                              disabled={streaming}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                              aria-label="Regenerate with a different angle"
                              data-testid={`sidekick-regenerate-${i}`}
                            >
                              <RefreshCw className="w-3 h-3" /> Different angle
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div className="px-4 py-3.5 border-t border-border bg-white shrink-0">
            {voiceError && (
              <p className="text-[12px] text-red-600 mb-2" role="alert" data-testid="sidekick-voice-error">
                {voiceError}
              </p>
            )}
            {voiceState === "recording" && (
              <p className="text-[12px] text-[#F06127] font-medium mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#F06127] animate-pulse" />
                Listening… tap the mic again to send.
              </p>
            )}
            {voiceState === "transcribing" && (
              <p className="text-[12px] text-muted-foreground mb-2 flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Transcribing…
              </p>
            )}
            {voiceState === "speaking" && (
              <p className="text-[12px] text-muted-foreground mb-2 flex items-center gap-1.5">
                <Volume2 className="w-3 h-3" />
                Speaking… tap to mute.
              </p>
            )}
            <div className="flex gap-2 items-end">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  voiceState === "recording"
                    ? "Listening…"
                    : Date.now() < cooldownUntil
                    ? "Just a moment…"
                    : "Ask Sidekick anything…"
                }
                disabled={inputDisabled || voiceState === "recording" || voiceState === "transcribing"}
                className="flex-1 resize-none rounded-xl border border-border bg-white px-3.5 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-[#F06127] transition-colors min-h-[44px] max-h-[120px] leading-snug disabled:opacity-50"
                style={{ fontFamily: "inherit" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 120) + "px";
                }}
              />
              {VOICE_SUPPORTED && (
                <button
                  onClick={handleMicClick}
                  disabled={streaming || voiceState === "transcribing"}
                  className={cn(
                    "w-[44px] h-[44px] rounded-xl flex items-center justify-center shrink-0 transition-colors disabled:opacity-40",
                    voiceState === "recording"
                      ? "bg-red-500 text-white animate-pulse"
                      : "bg-white border border-border text-foreground hover:border-[#F06127] hover:text-[#F06127]"
                  )}
                  aria-label={
                    voiceState === "recording" ? "Stop recording and send" : "Record a voice message"
                  }
                  title={
                    voiceState === "recording"
                      ? "Stop recording and send"
                      : "Record a voice message"
                  }
                  data-testid="sidekick-mic"
                >
                  {voiceState === "recording" ? (
                    <Square className="w-4 h-4" />
                  ) : voiceState === "transcribing" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || inputDisabled || voiceState !== "idle"}
                className="w-[44px] h-[44px] rounded-xl flex items-center justify-center shrink-0 text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "#F06127" }}
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );

  if (aiDisabledByOrg) {
    return <AiDisabledByOrgRail userId={user?.id ?? null} />;
  }

  return (
    <>
      {/* ── Desktop: right sidebar (hidden on mobile) ── */}
      <div
        className="hidden lg:flex h-full flex-col bg-white transition-all duration-300 ease-in-out flex-shrink-0"
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
