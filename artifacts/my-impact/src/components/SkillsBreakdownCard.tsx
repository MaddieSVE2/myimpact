import { useEffect, useMemo, useRef } from "react";
import { computeSkillsBreakdown, type SkillActivityLike } from "@/lib/skills";

// Shared "Skills & development" breakdown card, extracted from the University
// dashboard so any org with the super-admin `skills` section flag enabled can
// render the same block from its live activities feed.

function AnimatedBar({ pct, delay = 0 }: { pct: number; delay?: number }) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    el.style.width = "0%";
    const timer = setTimeout(() => {
      el.style.transition = "width 1s cubic-bezier(0.4,0,0.2,1)";
      el.style.width = `${pct}%`;
    }, delay);
    return () => clearTimeout(timer);
  }, [pct, delay]);
  return <div ref={barRef} className="h-full rounded-full bg-primary/30" style={{ width: "0%" }} />;
}

interface SkillsBreakdownCardProps {
  activities: SkillActivityLike[];
  loading: boolean;
  title: string;
  description: string;
  /** Plural noun for the people building skills, e.g. "students" or "members". */
  peopleNoun: string;
  className?: string;
}

export function SkillsBreakdownCard({
  activities, loading, title, description, peopleNoun, className,
}: SkillsBreakdownCardProps) {
  const skillsBreakdown = useMemo(() => computeSkillsBreakdown(activities), [activities]);

  return (
    <div className={className ?? "bg-white border border-border rounded-xl p-6"} data-testid="section-skills-development">
      <p className="text-[11px] font-bold uppercase tracking-[2px] text-primary mb-3">Skills &amp; development</p>
      <h2 className="text-xl font-display font-bold text-foreground mb-6">{title}</h2>
      <p className="text-sm text-muted-foreground -mt-4 mb-6">{description}</p>
      {loading ? (
        <div className="py-6 flex justify-center">
          <div className="animate-spin w-6 h-6 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      ) : skillsBreakdown.length === 0 ? (
        <p className="text-[13px] text-muted-foreground py-6 text-center">No activity has been logged in this period yet.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4" data-testid="list-top-skills">
          {skillsBreakdown.map((s, idx) => (
            <div key={s.skill} className="flex items-center gap-3" data-testid={`skill-row-${idx}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-foreground truncate">{s.skill}</p>
                  <p className="text-sm font-bold text-foreground shrink-0">{s.pct}%</p>
                </div>
                <div className="h-2 mt-1.5 rounded-full bg-muted overflow-hidden">
                  <AnimatedBar pct={s.pct} delay={idx * 80} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {s.students} {peopleNoun} · {s.hours.toLocaleString("en-GB")} hours · {s.activities} activities
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
