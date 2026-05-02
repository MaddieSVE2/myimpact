export interface Badge {
  id: string;
  name: string;
  description: string;
  emoji: string;
  colour: string;
  earned: boolean;
  secret?: boolean;
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

export interface ComputeBadgesInput {
  totalValue: number;
  activityBreakdowns: Array<{ category: string; activityId?: string }>;
  isFirstRecord?: boolean;
  cumulativeHours?: number;
  cumulativeDonations?: number;
  cumulativePeopleSupported?: number;
  monthlyRecordCounts?: Record<string, number>;
  recordDates?: string[];
  isOrgMember?: boolean;
  accountAgeDays?: number;
  sdgIds?: string[];
  hasSharedInvite?: boolean;
}

function getSeasonFromMonth(month: number): string {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

function hasConsecutiveMonths(monthKeys: string[], n: number): boolean {
  if (monthKeys.length < n) return false;
  const sorted = [...monthKeys].sort();
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const [prevYear, prevMonth] = sorted[i - 1].split("-").map(Number);
    const [curYear, curMonth] = sorted[i].split("-").map(Number);
    const prevTotal = prevYear * 12 + prevMonth;
    const curTotal = curYear * 12 + curMonth;
    if (curTotal - prevTotal === 1) {
      streak++;
      if (streak >= n) return true;
    } else {
      streak = 1;
    }
  }
  return false;
}

export function computeBadges(
  input: ComputeBadgesInput,
  isFirstRecord?: boolean
): Badge[] {
  const {
    totalValue,
    activityBreakdowns,
    isFirstRecord: isFirstRecordFromInput,
    cumulativeHours = 0,
    cumulativeDonations = 0,
    cumulativePeopleSupported = 0,
    monthlyRecordCounts = {},
    recordDates = [],
    isOrgMember = false,
    accountAgeDays = 0,
    sdgIds = [],
    hasSharedInvite = false,
  } = input;

  const firstRecord = isFirstRecord ?? isFirstRecordFromInput ?? false;
  const categories = new Set(activityBreakdowns.map((a) => a.category));
  const total = totalValue;

  const monthsWithRecords = Object.keys(monthlyRecordCounts).filter(
    (k) => monthlyRecordCounts[k] > 0
  );
  const hasMonthWith3Records = monthsWithRecords.some(
    (k) => monthlyRecordCounts[k] >= 3
  );

  const uniqueSdgs = new Set(sdgIds);

  const seasons = new Set(
    recordDates.map((d) => {
      const month = new Date(d).getMonth() + 1;
      return getSeasonFromMonth(month);
    })
  );

  const hasEarlyBird = recordDates.some((d) => {
    const h = new Date(d).getHours();
    return h < 7;
  });
  const hasNightOwl = recordDates.some((d) => {
    const h = new Date(d).getHours();
    return h >= 22;
  });
  const hasWeekendWarrior = recordDates.some((d) => {
    const day = new Date(d).getDay();
    return day === 0 || day === 6;
  });
  const hasFestiveGiver = recordDates.some((d) => {
    const month = new Date(d).getMonth() + 1;
    return month === 12;
  });
  const hasFreshStart = recordDates.some((d) => {
    const month = new Date(d).getMonth() + 1;
    return month === 1;
  });
  const hasAllSeasons = seasons.has("spring") && seasons.has("summer") && seasons.has("autumn") && seasons.has("winter");
  const isLoyal = accountAgeDays > 365;

  const nonSecretBadges: Badge[] = [
    {
      id: "rising_star",
      name: "Rising Star",
      emoji: "⭐",
      colour: "#f59e0b",
      description: "You've calculated your social value for the first time. Welcome to My Impact!",
      earned: firstRecord,
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
    {
      id: "spread_the_word",
      name: "Spread the Word",
      emoji: "📣",
      colour: "#6366f1",
      description: "You shared My Impact with a friend, helping grow the community of changemakers.",
      earned: hasSharedInvite,
    },
    {
      id: "time_giver",
      name: "Time Giver",
      emoji: "⏰",
      colour: "#0ea5e9",
      description: "You've given 10 or more hours to volunteering. Every hour counts.",
      earned: cumulativeHours >= 10,
    },
    {
      id: "dedicated_volunteer",
      name: "Dedicated Volunteer",
      emoji: "⌚",
      colour: "#0284c7",
      description: "50+ hours of volunteering across all your records. Truly dedicated.",
      earned: cumulativeHours >= 50,
    },
    {
      id: "century_of_service",
      name: "Century of Service",
      emoji: "⌛",
      colour: "#0369a1",
      description: "100+ hours given to the community. An incredible commitment.",
      earned: cumulativeHours >= 100,
    },
    {
      id: "time_hero",
      name: "Time Hero",
      emoji: "🦸",
      colour: "#075985",
      description: "500+ hours volunteered. You are a genuine hero of your community.",
      earned: cumulativeHours >= 500,
    },
    {
      id: "generous_heart",
      name: "Generous Heart",
      emoji: "💝",
      colour: "#db2777",
      description: "You've logged a charitable donation. Every contribution makes a difference.",
      earned: cumulativeDonations > 0,
    },
    {
      id: "philanthropist",
      name: "Philanthropist",
      emoji: "🌍",
      colour: "#be185d",
      description: "You've donated over £1,000 in total. An incredible act of generosity.",
      earned: cumulativeDonations >= 1000,
    },
    {
      id: "major_donor",
      name: "Major Donor",
      emoji: "👑",
      colour: "#9d174d",
      description: "Over £5,000 donated in total. You are transforming lives through your giving.",
      earned: cumulativeDonations >= 5000,
    },
    {
      id: "people_person",
      name: "People Person",
      emoji: "👥",
      colour: "#7c3aed",
      description: "You've supported 10 or more people through your activities. Amazing.",
      earned: cumulativePeopleSupported >= 10,
    },
    {
      id: "changemaker",
      name: "Changemaker",
      emoji: "🏘️",
      colour: "#6d28d9",
      description: "50+ people supported across all your records. You're making a real impact.",
      earned: cumulativePeopleSupported >= 50,
    },
    {
      id: "hundred_hands",
      name: "Hundred Hands",
      emoji: "💯",
      colour: "#5b21b6",
      description: "100 people supported. Your reach is extraordinary.",
      earned: cumulativePeopleSupported >= 100,
    },
    {
      id: "multiplier",
      name: "Multiplier",
      emoji: "🌊",
      colour: "#4c1d95",
      description: "500+ people supported. You are creating a wave of positive change.",
      earned: cumulativePeopleSupported >= 500,
    },
    {
      id: "renaissance_volunteer",
      name: "Renaissance Volunteer",
      emoji: "🌐",
      colour: "#059669",
      description: "You've contributed across all four categories: Environment, Community, Health, and Education.",
      earned:
        categories.has("Environment") &&
        categories.has("Community") &&
        categories.has("Health") &&
        categories.has("Education"),
    },
    {
      id: "sdg_champion",
      name: "SDG Champion",
      emoji: "🎯",
      colour: "#047857",
      description: "Your activities span 5 or more different Sustainable Development Goals.",
      earned: uniqueSdgs.size >= 5,
    },
    {
      id: "regular",
      name: "Regular",
      emoji: "📅",
      colour: "#d97706",
      description: "You've submitted 3 or more records in a single calendar month. Consistent effort counts.",
      earned: hasMonthWith3Records,
    },
    {
      id: "consistent",
      name: "Consistent",
      emoji: "🔥",
      colour: "#b45309",
      description: "Records submitted in 3 consecutive months. You're building a great habit.",
      earned: hasConsecutiveMonths(monthsWithRecords, 3),
    },
    {
      id: "dedicated",
      name: "Dedicated",
      emoji: "💫",
      colour: "#92400e",
      description: "Records submitted across 6 consecutive months. Remarkable dedication.",
      earned: hasConsecutiveMonths(monthsWithRecords, 6),
    },
    {
      id: "team_player",
      name: "Team Player",
      emoji: "🏢",
      colour: "#1d4ed8",
      description: "You've joined an organisation on My Impact. Stronger together.",
      earned: isOrgMember,
    },
  ];

  const allNonSecretEarned = nonSecretBadges.every((b) => b.earned);

  const secretBadges: Badge[] = [
    {
      id: "early_bird",
      name: "Early Bird",
      emoji: "🌅",
      colour: "#f59e0b",
      description: "You submitted a record before 7am. Rise and shine!",
      earned: hasEarlyBird,
      secret: true,
    },
    {
      id: "night_owl",
      name: "Night Owl",
      emoji: "🦉",
      colour: "#6366f1",
      description: "You submitted a record after 10pm. Burning the midnight oil for a good cause.",
      earned: hasNightOwl,
      secret: true,
    },
    {
      id: "weekend_warrior",
      name: "Weekend Warrior",
      emoji: "💪",
      colour: "#ef4444",
      description: "You submitted a record on a weekend. Your free time goes to great things.",
      earned: hasWeekendWarrior,
      secret: true,
    },
    {
      id: "festive_giver",
      name: "Festive Giver",
      emoji: "🎄",
      colour: "#16a34a",
      description: "You submitted a record in December. Seasonal giving at its finest.",
      earned: hasFestiveGiver,
      secret: true,
    },
    {
      id: "fresh_start",
      name: "Fresh Start",
      emoji: "🎆",
      colour: "#2563eb",
      description: "You submitted a record in January. Starting the year with purpose.",
      earned: hasFreshStart,
      secret: true,
    },
    {
      id: "all_seasons",
      name: "All Seasons",
      emoji: "🌈",
      colour: "#8b5cf6",
      description: "You've logged records across all four seasons of the year. A year-round contributor.",
      earned: hasAllSeasons,
      secret: true,
    },
    {
      id: "loyal",
      name: "Loyal",
      emoji: "🎂",
      colour: "#f97316",
      description: "Your account has been active for over a year. Loyal through and through.",
      earned: isLoyal,
      secret: true,
    },
    {
      id: "completionist",
      name: "Completionist",
      emoji: "⭐",
      colour: "#eab308",
      description: "You've earned every non-secret milestone. A true completionist.",
      earned: allNonSecretEarned,
      secret: true,
    },
  ];

  return [...nonSecretBadges, ...secretBadges];
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
