// Skills & development breakdown for live org dashboards.
//
// Skills are inferred from the type of each logged activity: the activity
// name is matched against keyword rules, with a category-level fallback so
// every activity contributes to at least one skill. The percentage for a
// skill is the share of actively logging students whose activities build it.

export interface SkillBreakdownPoint {
  skill: string;
  students: number;
  hours: number;
  activities: number;
  pct: number;
}

export interface SkillActivityLike {
  memberId: string;
  category: string;
  activity: string;
  hours: number;
}

const KEYWORD_RULES: Array<{ pattern: RegExp; skills: string[] }> = [
  { pattern: /mentor/i, skills: ["Mentoring and coaching", "Communication", "Leadership"] },
  { pattern: /coach/i, skills: ["Mentoring and coaching", "Communication", "Leadership"] },
  { pattern: /tutor|teach|literacy/i, skills: ["Communication", "Public speaking"] },
  { pattern: /workshop|stem|coding/i, skills: ["Public speaking", "Digital skills", "Project management"] },
  { pattern: /digital|computer|tech/i, skills: ["Digital skills", "Communication"] },
  { pattern: /career|employability|cv|interview/i, skills: ["Communication", "Mentoring and coaching"] },
  { pattern: /duke of edinburgh/i, skills: ["Leadership", "Teamwork", "Problem solving", "Time management"] },
  { pattern: /fundrais/i, skills: ["Project management", "Communication", "Teamwork"] },
  { pattern: /food bank|community|volunteer/i, skills: ["Teamwork", "Time management"] },
  { pattern: /litter|clean|garden|conservation/i, skills: ["Teamwork", "Problem solving"] },
  { pattern: /event|organis/i, skills: ["Project management", "Teamwork"] },
  { pattern: /sport|cricket|cycling|football|swim/i, skills: ["Teamwork", "Leadership"] },
];

const CATEGORY_SKILLS: Record<string, string[]> = {
  "Education": ["Communication"],
  "Mentoring": ["Mentoring and coaching", "Communication"],
  "Community": ["Teamwork"],
  "Environment": ["Teamwork"],
  "Sport & Active": ["Teamwork"],
  "Fundraising": ["Project management"],
  "Health & Wellbeing": ["Communication"],
};

function skillsForActivity(a: SkillActivityLike): string[] {
  const matched = new Set<string>();
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(a.activity)) {
      for (const s of rule.skills) matched.add(s);
    }
  }
  if (matched.size === 0) {
    for (const s of CATEGORY_SKILLS[a.category] ?? ["Teamwork"]) matched.add(s);
  }
  return Array.from(matched);
}

export function computeSkillsBreakdown(activities: SkillActivityLike[]): SkillBreakdownPoint[] {
  const activeStudents = new Set(activities.map(a => a.memberId)).size;
  const map = new Map<string, { students: Set<string>; hours: number; activities: number }>();

  for (const a of activities) {
    for (const skill of skillsForActivity(a)) {
      const entry = map.get(skill) ?? { students: new Set<string>(), hours: 0, activities: 0 };
      entry.students.add(a.memberId);
      entry.hours += a.hours;
      entry.activities += 1;
      map.set(skill, entry);
    }
  }

  return Array.from(map.entries())
    .map(([skill, e]) => ({
      skill,
      students: e.students.size,
      hours: Math.round(e.hours),
      activities: e.activities,
      pct: activeStudents > 0 ? Math.round((e.students.size / activeStudents) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct || b.hours - a.hours)
    .slice(0, 8);
}
