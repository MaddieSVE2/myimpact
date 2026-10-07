import { SECTION_MAX_WIDTH } from "@/lib/layout";
import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { scrollContentToTop } from "@/lib/scroll-utils";
import { PageMeta } from "@/components/PageMeta";
import { METHODOLOGY_META } from "@/lib/page-metadata";

const C = {
  dark: "var(--brand-dark)",
  orange: "var(--brand-orange)",
  olive: "var(--brand-olive)",
  cream: "var(--brand-cream)",
  offBlack: "var(--brand-off-black)",
};

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");
const LAST_UPDATED = "24 September 2026";

function CitationLink({ id, children }: { id: string; children: React.ReactNode }) {
  return <a href={`#citation-${id}`} style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "var(--brand-orange)", textUnderlineOffset: 3 }}>{children}</a>;
}

function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible] as const;
}

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const [ref, visible] = useInView(0.1);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

interface CollapsibleSection {
  id: string;
  title: string;
  summary: string;
  content: React.ReactNode;
}

const SECTIONS: CollapsibleSection[] = [
  {
    id: "value-calculation",
    title: "How social value is calculated",
    summary: "Each logged activity is multiplied by an evidence-based proxy value, then summed across four pillars.",
    content: (
      <>
        <p>Every activity in My Impact has a <strong>proxy value</strong>: a monetary estimate of the social, health, or environmental benefit it produces, drawn from published datasets or sector research. These are estimates, not independently peer-reviewed values for every activity. We sum the contributions across four pillars to give a total estimated social value:</p>
        <ol style={{ marginTop: 14, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          <li>
            <strong>Impact of activities</strong>: the proxy value for each activity multiplied by how much you did. Hour-based activities use the per-hour proxy; count-based activities (e.g. trees planted, bags donated) use the per-unit proxy.
          </li>
          <li>
            <strong>Time contributed</strong>: total volunteer hours across all activities, valued at <strong>£12.21/hour</strong> (<CitationLink id="living-wage">GOV.UK National Living Wage rates</CitationLink>, 2025/26). This recognises that freely given time has real economic value.
          </li>
          <li>
            <strong>Donations</strong>: the direct monetary value of charitable donations you have logged.
          </li>
          <li>
            <strong>Personal growth</strong>: the same volunteer hours valued at <strong>£15/hour</strong>, an illustrative skills premium. <CitationLink id="ncvo">NCVO's <em>Time Well Spent</em> (2023)</CitationLink> documents volunteers' reported skills and employment benefits; it does not establish this £15/hour rate.
          </li>
        </ol>
        <p style={{ marginTop: 14 }}>The four pillars are reported separately so funders, employers and individuals can see exactly which kind of value is being claimed and avoid double counting.</p>
        <p style={{ marginTop: 14, fontSize: 14, color: "var(--brand-muted-text)", fontStyle: "italic" }}>
          Worked example: 50 hours of community gardening at £14.43/hour = £721.50 of impact value, plus £610.50 of contribution value (50 × £12.21), plus £750 of personal growth value (50 × £15). Total: £2,082 from a single activity.
        </p>
      </>
    ),
  },
  {
    id: "data-sources",
    title: "Where the proxy values come from",
    summary: "Proxies are sourced from the Social Value Engine, GOV.UK datasets, and peer-reviewed UK research.",
    content: (
      <>
        <p>My Impact does not invent values. Every proxy is sourced from one of the following:</p>
        <ul style={{ marginTop: 14, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          <li>
            <strong><CitationLink id="sve">The Social Value Engine</CitationLink></strong>: a platform for social value measurement used by councils, universities and charities. Its approach draws on <CitationLink id="green-book">HM Treasury's Green Book</CitationLink> and <CitationLink id="svi">Social Value International principles</CitationLink>.
          </li>
          <li>
            <strong>Government and public-sector data</strong>: <CitationLink id="landfill">UK Landfill Tax rates</CitationLink>, <CitationLink id="living-wage">National Living Wage rates</CitationLink>, and the <CitationLink id="gmca">Greater Manchester Combined Authority unit-cost database</CitationLink>.
          </li>
          <li>
            <strong>UK research and evaluations</strong>: <CitationLink id="pssru">PSSRU unit costs</CitationLink>, <CitationLink id="sport">Sport England's social value research</CitationLink>, <CitationLink id="refuge">NEF Consulting's Refuge SROI</CitationLink>, <CitationLink id="pbe">Pro Bono Economics' community asset transfer research</CitationLink>, <CitationLink id="volunteer-scotland">Volunteer Scotland's wellbeing research</CitationLink>, and <CitationLink id="fareshare">FareShare's impact research</CitationLink>. These sources have different methods and are not all peer-reviewed journal articles.
          </li>
          <li>
            <strong>Sector-specific reports</strong>: <CitationLink id="wildlife">The Wildlife Trusts' Network for Nature</CitationLink>, <CitationLink id="ncvo">NCVO's Time Well Spent</CitationLink>, and an <CitationLink id="action">Action for Children evaluation cited in the activity library</CitationLink>.
          </li>
        </ul>
        <p style={{ marginTop: 14 }}>Each activity stores its proxy source string and the year of the value. The citations below link to the source documents where publicly available. A publisher overview is marked as such when the exact underlying evaluation could not be located; it should not be taken as verification of a particular proxy figure.</p>
      </>
    ),
  },
  {
    id: "sdg-mapping",
    title: "How activities map to UN Sustainable Development Goals",
    summary: "Every activity is tagged with the single SDG it contributes to most directly.",
    content: (
      <>
        <p>The UN Sustainable Development Goals (SDGs) are the 17 global goals adopted by world leaders to end poverty, protect the planet, and ensure prosperity for all by 2030. Funders, employers, and government bodies increasingly report against them.</p>
        <p style={{ marginTop: 12 }}>To keep mapping honest, we apply two rules:</p>
        <ul style={{ marginTop: 14, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          <li>
            <strong>Single primary SDG per activity</strong>: every activity is tagged with the one Goal it contributes to most directly. We do not double-count an activity across multiple Goals, even when it is plausibly relevant to several.
          </li>
          <li>
            <strong>Proxy and Goal must align</strong>: the proxy value must measure an outcome the SDG is concerned with. Conservation volunteering, for example, uses a wage-replacement proxy attributed to <CitationLink id="wildlife">The Wildlife Trusts</CitationLink> and is tagged Life on Land, not Decent Work.
          </li>
        </ul>
        <p style={{ marginTop: 14 }}>This is deliberately conservative. Many activities have spillover benefits to other SDGs (a community garden creates both Life on Land and Good Health and Well-Being value), but counting only the primary Goal keeps headline figures defensible to funders and auditors.</p>
      </>
    ),
  },
  {
    id: "verification",
    title: "How verification works",
    summary: "Self-reported by default; org-verified hours coming soon for stricter funder reporting.",
    content: (
      <>
        <p>Today, every figure on My Impact is <strong>self-reported</strong>. We do not yet require third-party sign-off on individual contributions. We are honest about that on every results page.</p>
        <p style={{ marginTop: 12 }}>Three measures are already in place to keep numbers credible:</p>
        <ul style={{ marginTop: 14, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          <li>
            <strong>Sensible defaults and frequency caps</strong>: every activity has a sensible default and a guidance question that discourages double-counting (for example, the general charity volunteering activity explicitly tells users to avoid counting hours already logged under a more specific activity).
          </li>
          <li>
            <strong>Conservative proxy choice</strong>: where multiple proxies exist for the same outcome, we use the lower or more widely accepted one.
          </li>
          <li>
            <strong>Single-SDG attribution</strong>: see the SDG mapping rule above.
          </li>
        </ul>
        <p style={{ marginTop: 14 }}>
          <strong>Coming next:</strong> organisations will be able to verify the hours their members log against shared activities. When that ships, every record will carry a verification status (self-reported or org-verified), and funder reports will be able to show only verified contributions. Find this work in the project roadmap on the About page.
        </p>
      </>
    ),
  },
  {
    id: "uncertainty",
    title: "How we handle uncertainty",
    summary: "We round, we cap, we publish the proxy year, and we always show the breakdown.",
    content: (
      <>
        <p>Social value figures are estimates, not invoices. We have built in several practices to make sure the headline number is defensible:</p>
        <ul style={{ marginTop: 14, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 10 }}>
          <li>
            <strong>Rounding</strong>: totals are rounded to whole pounds in the UI; underlying calculations carry two decimal places to avoid rounding drift.
          </li>
          <li>
            <strong>Conservative defaults</strong>: defaults are set at the lower end of typical participation rather than averages, so the displayed estimate skews low if a user accepts the default without editing.
          </li>
          <li>
            <strong>Per-activity transparency</strong>: every activity shows the proxy source, the year of the value, and the unit it is measured in. Users see the breakdown that makes up their total before accepting it.
          </li>
          <li>
            <strong>Refresh cadence</strong>: proxies are reviewed at least annually and refreshed when the underlying source publishes a new edition.
          </li>
        </ul>
        <p style={{ marginTop: 14 }}>For activities that may be claimed in more than one place (caring, employability, community involvement), the friendly-question copy explicitly warns against double counting hours already logged elsewhere.</p>
      </>
    ),
  },
];

const CITATIONS: { id: string; label: string; href: string; note?: string }[] = [
  { id: "sve", label: "Social Value Engine — social value measurement platform.", href: "https://www.socialvalueengine.com" },
  { id: "green-book", label: "HM Treasury, The Green Book: appraisal and evaluation in central government (publication page; current and previous editions).", href: "https://www.gov.uk/government/publications/the-green-book-appraisal-and-evaluation-in-central-government" },
  { id: "svi", label: "Social Value International, Principles of Social Value.", href: "https://www.socialvalueint.org/principles" },
  { id: "living-wage", label: "GOV.UK, National Minimum Wage and National Living Wage rates; £12.21/hour for ages 21+ in 2025/26.", href: "https://www.gov.uk/national-minimum-wage-rates" },
  { id: "landfill", label: "HMRC, rates and allowances: Landfill Tax (standard rate £126.15/tonne from April 2025).", href: "https://www.gov.uk/government/publications/rates-and-allowances-landfill-tax" },
  { id: "gmca", label: "Greater Manchester Combined Authority, cost-benefit analysis and Unit Cost Database (downloadable workbook; current version published November 2025).", href: "https://www.greatermanchester-ca.gov.uk/what-we-do/research/research-cost-benefit-analysis/", note: "Activity proxies may cite an earlier edition; the linked page hosts the latest workbook and methodology." },
  { id: "pssru", label: "PSSRU, Unit Costs of Health and Social Care 2022: A Manual (Kent Academic Repository, DOI 10.22024/UniKent/01.02.100519).", href: "https://kar.kent.ac.uk/100519/", note: "Cited for informal-carer replacement costs." },
  { id: "sport", label: "Sport England, Social value and return on investment of sport and physical activity (model and Active Lives data; results first published 2024).", href: "https://www.sportengland.org/research-and-data/research/social-value-and-return-investment-sport-and-physical-activity", note: "Cited for physical-activity and children's wellbeing proxies." },
  { id: "ncvo", label: "NCVO, Time Well Spent 2023: Volunteer experience and impact, section 5 (27 June 2023).", href: "https://www.ncvo.org.uk/news-and-insights/news-index/time-well-spent-2023/volunteer-experience-impact", note: "Describes reported benefits, not the £15/hour personal-growth rate used in our illustrative calculation." },
  { id: "volunteer-scotland", label: "Volunteer Scotland and State of Life, The social value of volunteering in Scotland — Technical Report (2025, PDF).", href: "https://www.volunteerscotland.net/wp-content/uploads/2025/03/The-social-value-of-volunteering-in-Scotland-%E2%80%93-Technical-Report.pdf", note: "Cited for volunteer wellbeing proxies." },
  { id: "fareshare", label: "FareShare, Impact Report (September 2023, PDF).", href: "https://fareshare.org.uk/wp-content/uploads/2023/09/FareShare-Impact-Report_Sep2023.pdf", note: "The activity-library £185/visit figure attributed to a 2018 report is not verified by this later report." },
  { id: "wildlife", label: "The Wildlife Trusts, Network for Nature Annual Report Year 1 (May 2022, PDF).", href: "https://www.wildlifetrusts.org/sites/default/files/2024-06/N4N%20Annual%20Report%20Y1%20FINAL%2006-07-2022.pdf", note: "The activity-library attribution says 2025; the publisher's Year 1 report is dated 2022. The £9.50/hour proxy has not been verified against this report." },
  { id: "pbe", label: "Pro Bono Economics, Our assets, our future: the economics, outcomes and sustainability of assets in community ownership (2017, via Power to Change project page).", href: "https://pbe.co.uk/impact_stories/power-to-change", note: "The activity-library £5,176/person attribution has not been verified against this report." },
  { id: "action", label: "Action for Children, impact and evaluation overview.", href: "https://www.actionforchildren.org.uk/our-work-and-impact/our-impact", note: "The cited Wheatley Children's Centre evaluation (2023) and £3,159/child proxy could not be located publicly; this overview is not that evaluation." },
  { id: "refuge", label: "NEF Consulting for Refuge, Social Return on Investment: updated SROI model (16 March 2021, PDF).", href: "https://refuge.org.uk/wp-content/uploads/2021/04/NEF-Consulting-Refuge-updated-SROI-Model-Report-FINAL_16.03.21.pdf", note: "The activity library attributes its social-connection proxy to this model; the £8,040/person figure has not been verified against the report." },
  { id: "sdg", label: "United Nations, The 17 Sustainable Development Goals.", href: "https://sdgs.un.org/goals" },
];

export default function Methodology() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    scrollContentToTop();
  }, []);

  function toggle(id: string) {
    setOpen(o => ({ ...o, [id]: !o[id] }));
  }

  async function handleDownload() {
    setDownloading(true);
    setDownloadError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/impact/evidence-pack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-impact-evidence-pack.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[evidence-pack]", err);
      setDownloadError("Sorry, the download didn't work. Please try again in a moment.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.dark, overflowX: "hidden" }}>
      <PageMeta
        title={METHODOLOGY_META.title}
        description={METHODOLOGY_META.description}
        canonical={METHODOLOGY_META.canonical}
        ogType={METHODOLOGY_META.ogType}
        jsonLd={METHODOLOGY_META.jsonLd}
      />

      {/* ── HERO ── */}
      <section className="mi-hero" style={{ minHeight: "auto", paddingBottom: 80, paddingTop: 80 }}>
        <div style={{ position: "relative", zIndex: 2, padding: "0 5%", maxWidth: SECTION_MAX_WIDTH, width: "100%", margin: "0 auto" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.13)",
            backdropFilter: "blur(8px)",
            padding: "8px 18px", borderRadius: 100,
            color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 700,
            letterSpacing: 1.5, textTransform: "uppercase" as const,
            marginBottom: 28,
          }}>
            <span className="mi-dot" /> Methodology &amp; Evidence
          </div>

          <h1
            className="mi-fraunces"
            style={{
              fontSize: "clamp(38px, 6vw, 62px)",
              fontWeight: 900, color: "white",
              lineHeight: 1.05, marginBottom: 20, letterSpacing: -2,
            }}
          >
            Where every number{" "}
            <span style={{ color: C.orange, fontStyle: "italic" }}>actually comes from.</span>
          </h1>

          <p style={{ fontSize: "clamp(16px, 2vw, 19px)", color: "rgba(255,255,255,0.75)", lineHeight: 1.7, maxWidth: 640 }}>
            My Impact uses the Social Return on Investment (SROI) framework, accredited Social Value Engine proxies, and the UN Sustainable Development Goals to convert everyday acts of contribution into a defensible monetary figure. This page explains how, in plain English at the top, with the technical detail beneath.
          </p>

          <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap" as const, gap: 12 }}>
            <button
              onClick={handleDownload}
              disabled={downloading}
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                background: C.orange, color: "white",
                padding: "14px 24px", borderRadius: 8,
                fontSize: 15, fontWeight: 700,
                border: "none", cursor: downloading ? "wait" : "pointer",
                opacity: downloading ? 0.8 : 1,
                transition: "transform 0.15s ease, opacity 0.15s ease",
                boxShadow: "0 6px 20px rgba(232,99,58,0.35)",
              }}
              data-testid="button-download-evidence-pack"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
              {downloading ? "Preparing pack…" : "Download evidence pack"}
            </button>
            <Link
              href="/about"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.18)",
                color: "white",
                padding: "14px 24px", borderRadius: 8,
                fontSize: 15, fontWeight: 600, textDecoration: "none",
              }}
            >
              About My Impact →
            </Link>
          </div>

          {downloadError && (
            <p role="alert" style={{ marginTop: 16, fontSize: 13, color: "#FFC4B0" }}>
              {downloadError}
            </p>
          )}
        </div>
      </section>

      {/* ── PLAIN-ENGLISH SUMMARY ── */}
      <section style={{ background: C.cream, padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <FadeIn>
          <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.orange, marginBottom: 16 }}>
              In plain English
            </p>
            <h2 style={{ fontSize: "clamp(24px, 3.5vw, 36px)", fontWeight: 700, color: C.dark, lineHeight: 1.25, marginBottom: 20, letterSpacing: -0.5, fontFamily: "'Outfit', sans-serif" }}>
              The four-line version, before the detail.
            </h2>
            <ol style={{ fontSize: 17, color: "var(--brand-muted-text)", lineHeight: 1.75, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 12 }}>
              <li>
                <strong>We use published proxy research and the Social Value Engine.</strong> Activity values are estimates sourced from external research; the separate £15/hour personal-growth assumption is illustrative, not a published NCVO rate.
              </li>
              <li>
                <strong>Each activity is tagged to one UN SDG.</strong> One activity, one Goal, no double counting across Goals.
              </li>
              <li>
                <strong>We add four pillars.</strong> Activity impact, time at the National Living Wage, donations, and a personal-growth premium. We always show the breakdown so funders can see what's claimed.
              </li>
              <li>
                <strong>Today, contributions are self-reported.</strong> Org-side hours verification is on the roadmap and will give every record a verified status.
              </li>
            </ol>
          </div>
        </FadeIn>
      </section>

      {/* ── COLLAPSIBLE TECHNICAL SECTIONS ── */}
      <section style={{ background: "white", padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <FadeIn>
          <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.orange, marginBottom: 16 }}>
              The technical detail
            </p>
            <h2 style={{ fontSize: "clamp(24px, 3.5vw, 36px)", fontWeight: 700, color: C.dark, lineHeight: 1.25, marginBottom: 28, letterSpacing: -0.5, fontFamily: "'Outfit', sans-serif" }}>
              For funders, partners, and journalists.
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {SECTIONS.map((s, i) => {
                const isOpen = !!open[s.id];
                return (
                  <div
                    key={s.id}
                    id={s.id}
                    style={{
                      background: C.cream,
                      borderRadius: 14,
                      border: `1px solid var(--brand-cream-border, #E8E5DE)`,
                      overflow: "hidden",
                    }}
                  >
                    <button
                      onClick={() => toggle(s.id)}
                      aria-expanded={isOpen}
                      aria-controls={`${s.id}-body`}
                      data-testid={`button-toggle-${s.id}`}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 18,
                        padding: "22px 24px",
                        background: "transparent",
                        border: "none",
                        textAlign: "left",
                        cursor: "pointer",
                        color: "inherit",
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: C.orange, color: "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 800, fontSize: 13, flexShrink: 0, marginTop: 2,
                        fontFamily: "'Outfit', sans-serif",
                      }}>
                        {i + 1}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h3 style={{
                          fontSize: "clamp(17px, 2.4vw, 22px)",
                          fontWeight: 700,
                          color: C.dark,
                          fontFamily: "'Outfit', sans-serif",
                          margin: 0,
                          letterSpacing: -0.3,
                        }}>
                          {s.title}
                        </h3>
                        <p style={{ marginTop: 6, fontSize: 14, color: "var(--brand-muted-text)", lineHeight: 1.55 }}>
                          {s.summary}
                        </p>
                      </div>
                      <ChevronDown
                        className="shrink-0"
                        style={{
                          width: 20, height: 20, marginTop: 8,
                          color: C.dark, opacity: 0.65,
                          transition: "transform 0.2s ease",
                          transform: isOpen ? "rotate(180deg)" : "rotate(0)",
                        }}
                        aria-hidden="true"
                      />
                    </button>
                    {isOpen && (
                      <div
                        id={`${s.id}-body`}
                        style={{
                          padding: "0 24px 26px 74px",
                          fontSize: 15, color: "var(--brand-muted-text)", lineHeight: 1.75,
                        }}
                      >
                        {s.content}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── EVIDENCE PACK CTA ── */}
      <section style={{ background: C.dark, padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <FadeIn>
          <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "clamp(32px, 5vw, 56px)", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.orange, marginBottom: 16 }}>
                Evidence pack
              </p>
              <h2 style={{ fontSize: "clamp(24px, 3.5vw, 38px)", fontWeight: 700, color: "white", lineHeight: 1.2, marginBottom: 16, letterSpacing: -0.5, fontFamily: "'Outfit', sans-serif" }}>
                One PDF with every reference your team needs.
              </h2>
              <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", lineHeight: 1.75, marginBottom: 24 }}>
                The evidence pack bundles the methodology summary, the four formulas, field-evidence quotes from our pilot trials, advisory group bios, and the full citations list, formatted for funder, partner, and journalist reading.
              </p>
              <button
                onClick={handleDownload}
                disabled={downloading}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 10,
                  background: C.orange, color: "white",
                  padding: "14px 24px", borderRadius: 8,
                  fontSize: 15, fontWeight: 700,
                  border: "none", cursor: downloading ? "wait" : "pointer",
                  opacity: downloading ? 0.8 : 1,
                }}
                data-testid="button-download-evidence-pack-bottom"
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
                {downloading ? "Preparing pack…" : "Download evidence pack (PDF)"}
              </button>
            </div>
            <div style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: "clamp(22px, 3vw, 32px)",
            }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 16 }}>
                Pack contents
              </p>
              {[
                "Plain-English methodology summary",
                "Four-pillar formulas with worked examples",
                "Field-evidence quotes from pilot users",
                "Advisory group, chaired by David Emerson CBE",
                "Full citations list with sources and years",
              ].map((item) => (
                <div key={item} style={{ display: "flex", gap: 10, marginBottom: 12, fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 1.55 }}>
                  <span style={{ color: C.orange, fontWeight: 800 }}>•</span>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── CITATIONS ── */}
      <section id="citations" style={{ background: C.cream, padding: "clamp(60px, 10vw, 100px) 5%" }}>
        <FadeIn>
          <div style={{ maxWidth: SECTION_MAX_WIDTH, margin: "0 auto" }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: C.orange, marginBottom: 16 }}>
              Citations
            </p>
            <h2 style={{ fontSize: "clamp(24px, 3.5vw, 36px)", fontWeight: 700, color: C.dark, lineHeight: 1.25, marginBottom: 28, letterSpacing: -0.5, fontFamily: "'Outfit', sans-serif" }}>
              Sources and verification notes.
            </h2>
            <ol style={{ paddingLeft: 22, display: "flex", flexDirection: "column", gap: 12, fontSize: 14, color: "var(--brand-muted-text)", lineHeight: 1.7 }}>
              {CITATIONS.map((c) => (
                <li key={c.id} id={`citation-${c.id}`}>
                  <a href={c.href} target="_blank" rel="noopener noreferrer" style={{ color: C.dark, textDecoration: "underline", textDecorationColor: "var(--brand-orange)", textUnderlineOffset: 3 }}>
                    {c.label}
                  </a>
                  {c.note && <span> {c.note}</span>}
                </li>
              ))}
            </ol>
            <p style={{ marginTop: 28, fontSize: 13, color: "var(--brand-muted-text)", textAlign: "center" as const }}>
              Last updated: {LAST_UPDATED}
            </p>
          </div>
        </FadeIn>
      </section>

    </div>
  );
}
