const BASE_URL = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export type ArtworkSize = "web" | "export";

export function brandedArtworkUrl(file: string, size: ArtworkSize = "web"): string {
  return `${BASE_URL}/images/branded-artwork/${size}/${file}`;
}

/**
 * Explicit milestone-to-artwork mapping. An omitted entry is intentional:
 * consumers must retain the milestone's emoji as a fallback rather than guess.
 */
export const MILESTONE_ARTWORK: Readonly<Record<string, string>> = {
  rising_star: "radiant-golden-achievement-star.webp",
  green_guardian: "friendly-sprouting-plant-icon.webp",
  community_champion: "heartfelt-handshake-icon.webp",
  knowledge_keeper: "knowledge-keeper.webp",
  wellbeing_ally: "wellbeing-ally.webp",
  all_rounder: "all-rounder.webp",
  impact_maker: "achievement-growth-chart-icon.webp",
  champion: "champion-trophy-icon.webp",
  spread_the_word: "spread-the-word.webp",
  time_giver: "time-giver-stopwatch-heart.webp",
  dedicated_volunteer: "heart-medal-volunteer-badge.webp",
  century_of_service: "flat-blue-outlined-hourglass-icon.webp",
  time_hero: "time-hero-stopwatch-badge.webp",
  generous_heart: "heart-in-caring-hands.webp",
  philanthropist: "philanthropist.webp",
  major_donor: "crowned-heart-in-helping-hand.webp",
  people_person: "people-person.webp",
  changemaker: "community-changemaker-group.webp",
  hundred_hands: "hundred-hands.webp",
  multiplier: "community-growth-network.webp",
  renaissance_volunteer: "renaissance-volunteer-emblem.webp",
  sdg_champion: "global-impact-champion-badge.webp",
  regular: "regular.webp",
  consistent: "three-calendar-streak-icon.webp",
  dedicated: "six-month-streak-calendar-badge.webp",
  team_player: "team-player.webp",
  early_bird: "early-bird.webp",
  night_owl: "night-owl.webp",
  weekend_warrior: "weekend-warrior.webp",
  festive_giver: "festive-giver.webp",
  fresh_start: "fresh-start.webp",
  all_seasons: "all-seasons.webp",
  loyal: "loyal.webp",
  completionist: "completionist.webp",
};

export const VALUE_MILESTONE_ARTWORK: Readonly<Record<number, string>> = {
  100: "century-club.webp",
  500: "five-hundred.webp",
  1000: "achievement-growth-chart-icon.webp",
  5000: "champion-trophy-icon.webp",
  10000: "legend.webp",
};

export const HOME_CATEGORY_ARTWORK = {
  volunteering: "heartfelt-handshake-icon.webp",
  caring: "hand-holding-a-heart-icon.webp",
  environment: "friendly-sprouting-plant-icon.webp",
  community: "heartwarming-neighborhood-community-icon.webp",
  campaigning: "flat-orange-megaphone-icon.webp",
  peerSupport: "supportive-conversation-icon.webp",
} as const;

export const ABOUT_CATEGORY_ARTWORK = {
  environment: "friendly-sprouting-plant-icon.webp",
  health: "community-support-heart-icon.webp",
  community: "heartwarming-neighborhood-community-icon.webp",
  education: "knowledge-keeper.webp",
} as const;

export const ORGANISATION_FEATURE_ARTWORK = {
  reporting: "flat-analytics-dashboard-icon.webp",
  privacy: "shield-lock-security-icon.webp",
  engagement: "community-chat-icon.webp",
} as const;

export const ORG_MEMBER_ACTION_ARTWORK = {
  quickLog: "heartfelt-handshake-icon.webp",
  pulse: "community-chat-icon.webp",
  challenges: "champion-trophy-icon.webp",
  impactRecord: "achievement-growth-chart-icon.webp",
} as const;