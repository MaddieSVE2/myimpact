export interface Badge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  colour: string;
  earned: boolean;
}

export interface Milestone {
  label: string;
  threshold: number;
  emoji: string;
}

export const MILESTONES: Milestone[] = [
  { label: "Rising Star", threshold: 100, emoji: "⭐" },
  { label: "Century Club", threshold: 100, emoji: "💰" },
  { label: "Five Hundred", threshold: 500, emoji: "🎯" },
  { label: "Impact Maker", threshold: 1000, emoji: "🏆" },
  { label: "Champion", threshold: 5000, emoji: "🥇" },
  { label: "Legend", threshold: 10000, emoji: "🌟" },
];

export function computeBadges(
  result: {
    totalValue: number;
    activityBreakdowns: Array<{ category: string }>;
  },
  isFirstRecord: boolean
): Badge[] {
  const categories = new Set(result.activityBreakdowns.map((a) => a.category));
  const total = result.totalValue;

  const badges: Badge[] = [
    {
      id: "rising_star",
      name: "Rising Star",
      emoji: "⭐",
      colour: "#f59e0b",
      description: "You've calculated your social value for the first time. Welcome to My Impact!",
      earned: isFirstRecord,
    },
    {
      id: "green_guardian",
      name: "Green Guardian",
      emoji: "🌱",
      colour: "#22c55e",
      description: "You're making a difference to the natural world through environmental activities.",
      earned: categories.has("Environment"),
    },
    {
      id: "community_champion",
      name: "Community Champion",
      emoji: "🤝",
      colour: "#3b82f6",
      description: "You're actively building stronger communities through your contributions.",
      earned: categories.has("Community"),
    },
    {
      id: "knowledge_keeper",
      name: "Knowledge Keeper",
      emoji: "📚",
      colour: "#8b5cf6",
      description: "You're empowering others through education and skills sharing.",
      earned: categories.has("Education"),
    },
    {
      id: "wellbeing_ally",
      name: "Wellbeing Ally",
      emoji: "❤️",
      colour: "#ec4899",
      description: "You're making a real difference to people's health and wellbeing.",
      earned: categories.has("Health"),
    },
    {
      id: "all_rounder",
      name: "All-Rounder",
      emoji: "🔄",
      colour: "#F06127",
      description: "You're contributing across three or more areas — a true all-rounder.",
      earned: categories.size >= 3,
    },
    {
      id: "century_club",
      name: "Century Club",
      emoji: "💰",
      colour: "#eab308",
      description: "Your social value has passed the £100 mark. Amazing!",
      earned: total >= 100,
    },
    {
      id: "five_hundred",
      name: "Five Hundred",
      emoji: "🎯",
      colour: "#f97316",
      description: "You've surpassed £500 in social value. You're making a serious difference.",
      earned: total >= 500,
    },
    {
      id: "impact_maker",
      name: "Impact Maker",
      emoji: "🏆",
      colour: "#F06127",
      description: "You've hit £1,000 in social value. You are genuinely changing lives.",
      earned: total >= 1000,
    },
    {
      id: "champion",
      name: "Champion",
      emoji: "🥇",
      colour: "#d97706",
      description: "Over £5,000 in social value. You're in rare company — a true champion of positive change.",
      earned: total >= 5000,
    },
  ];

  return badges;
}

export function getNextMilestone(totalValue: number): { milestone: Milestone; progress: number } | null {
  const ordered = [100, 500, 1000, 5000, 10000];
  const labels: Record<number, { label: string; emoji: string }> = {
    100: { label: "Century Club", emoji: "💰" },
    500: { label: "Five Hundred", emoji: "🎯" },
    1000: { label: "Impact Maker", emoji: "🏆" },
    5000: { label: "Champion", emoji: "🥇" },
    10000: { label: "Legend", emoji: "🌟" },
  };

  for (const threshold of ordered) {
    if (totalValue < threshold) {
      const prev = ordered[ordered.indexOf(threshold) - 1] ?? 0;
      const progress = Math.min(100, ((totalValue - prev) / (threshold - prev)) * 100);
      return {
        milestone: { threshold, emoji: labels[threshold].emoji, label: labels[threshold].label },
        progress,
      };
    }
  }
  return null;
}
