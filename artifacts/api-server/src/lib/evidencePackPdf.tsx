import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Link,
} from "@react-pdf/renderer";

Font.register({
  family: "Outfit",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf",
      fontWeight: 400,
    },
    {
      src: "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4deyC4E.ttf",
      fontWeight: 700,
    },
  ],
});

Font.register({
  family: "DM Sans",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAopxhTg.ttf",
      fontWeight: 400,
    },
    {
      src: "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwARZthTg.ttf",
      fontWeight: 700,
    },
  ],
});

const ORANGE = "#E8633A";
const NAVY = "#213547";
const CREAM = "#F7F5EF";
const CREAM_BORDER = "#E8E5DE";
const WHITE = "#FFFFFF";
const MUTED = "#6B7694";
const DARK_MUTED = "#4A5568";

const s = StyleSheet.create({
  page: { backgroundColor: CREAM, fontFamily: "DM Sans", padding: 0 },
  coverPage: { backgroundColor: NAVY, fontFamily: "DM Sans", padding: 0 },
  pageInner: { padding: 48, flex: 1 },
  coverInner: { padding: 48, flex: 1, justifyContent: "space-between" },

  logoRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  logoMy: { color: ORANGE, fontSize: 18, fontFamily: "Outfit", fontWeight: "bold" },
  logoImpact: { color: WHITE, fontSize: 18, fontFamily: "Outfit", fontWeight: "bold" },
  logoImpactDark: { color: NAVY, fontSize: 12, fontFamily: "Outfit", fontWeight: "bold" },
  logoMySmall: { color: ORANGE, fontSize: 12, fontFamily: "Outfit", fontWeight: "bold" },
  coverTagline: { color: "rgba(255,255,255,0.45)", fontSize: 9, letterSpacing: 2 },
  coverHero: { flex: 1, justifyContent: "center", paddingVertical: 40 },
  coverEyebrow: {
    color: "rgba(255,255,255,0.55)", fontSize: 11, letterSpacing: 2,
    textTransform: "uppercase", marginBottom: 14, fontFamily: "DM Sans",
  },
  coverHeadline: {
    color: WHITE, fontSize: 38, fontFamily: "Outfit", fontWeight: "bold",
    letterSpacing: -1, lineHeight: 1.1, marginBottom: 18, maxWidth: 380,
  },
  coverHeadlineAccent: { color: ORANGE },
  coverBlurb: { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 1.65, maxWidth: 400 },
  coverFooter: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
    paddingTop: 24, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)",
  },
  coverFooterText: { color: "rgba(255,255,255,0.4)", fontSize: 9.5, fontFamily: "DM Sans" },

  pageHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 26, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: CREAM_BORDER,
  },
  pageHeaderTitle: {
    fontSize: 20, fontFamily: "Outfit", fontWeight: "bold",
    color: NAVY, letterSpacing: -0.5,
  },
  pageHeaderLogo: { flexDirection: "row", alignItems: "center" },

  sectionEyebrow: {
    fontSize: 9, fontFamily: "DM Sans", fontWeight: "bold",
    color: ORANGE, letterSpacing: 1.8, marginBottom: 8,
  },
  sectionH2: {
    fontSize: 16, fontFamily: "Outfit", fontWeight: "bold",
    color: NAVY, marginBottom: 10, letterSpacing: -0.3,
  },
  bodyText: {
    fontSize: 10.5, fontFamily: "DM Sans", color: DARK_MUTED, lineHeight: 1.55, marginBottom: 8,
  },

  bulletRow: { flexDirection: "row", marginBottom: 6 },
  bulletDot: { width: 12, fontSize: 10.5, color: ORANGE, fontFamily: "DM Sans", fontWeight: "bold" },
  bulletText: { flex: 1, fontSize: 10.5, color: DARK_MUTED, lineHeight: 1.55, fontFamily: "DM Sans" },

  pillarCard: {
    backgroundColor: WHITE, borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: CREAM_BORDER, marginBottom: 8,
  },
  pillarTitle: { fontSize: 11, fontFamily: "Outfit", fontWeight: "bold", color: NAVY, marginBottom: 4 },
  pillarFormula: { fontSize: 9.5, color: ORANGE, fontFamily: "DM Sans", fontWeight: "bold", marginBottom: 4 },
  pillarBody: { fontSize: 9.5, color: DARK_MUTED, lineHeight: 1.5, fontFamily: "DM Sans" },

  quoteCard: {
    backgroundColor: WHITE, borderRadius: 8, padding: 14,
    borderWidth: 1, borderColor: CREAM_BORDER, marginBottom: 10,
  },
  quoteMark: {
    fontSize: 26, fontFamily: "Outfit", fontWeight: "bold",
    color: ORANGE, lineHeight: 1, marginBottom: 4,
  },
  quoteText: {
    fontSize: 11, fontFamily: "DM Sans", color: NAVY, lineHeight: 1.5, marginBottom: 8, fontWeight: "bold",
  },
  quoteAttr: {
    fontSize: 9, fontFamily: "DM Sans", color: MUTED, letterSpacing: 1, textTransform: "uppercase",
  },
  quoteSite: {
    fontSize: 9.5, fontFamily: "DM Sans", color: DARK_MUTED, marginTop: 2,
  },

  bioCard: {
    backgroundColor: WHITE, borderRadius: 8, padding: 12,
    borderWidth: 1, borderColor: CREAM_BORDER, marginBottom: 8,
  },
  bioName: { fontSize: 11, fontFamily: "Outfit", fontWeight: "bold", color: NAVY, marginBottom: 2 },
  bioRole: { fontSize: 9.5, color: ORANGE, fontFamily: "DM Sans", fontWeight: "bold", marginBottom: 4 },
  bioDetail: { fontSize: 9.5, color: DARK_MUTED, lineHeight: 1.5, fontFamily: "DM Sans" },

  citationItem: {
    flexDirection: "row", marginBottom: 7,
    paddingBottom: 7, borderBottomWidth: 0.5, borderBottomColor: CREAM_BORDER,
  },
  citationNum: {
    width: 18, fontSize: 9, color: ORANGE, fontFamily: "DM Sans", fontWeight: "bold",
  },
  citationText: {
    flex: 1, fontSize: 9.5, color: DARK_MUTED, lineHeight: 1.5, fontFamily: "DM Sans",
  },
  citationLink: { color: NAVY, textDecoration: "none" },

  pageFooter: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: 14, paddingTop: 10,
    borderTopWidth: 0.5, borderTopColor: CREAM_BORDER,
  },
  pageNumText: { fontSize: 8.5, color: MUTED, fontFamily: "DM Sans" },
});

const PILLARS = [
  {
    title: "1. Impact of activities",
    formula: "Quantity × Proxy value",
    body: "Each activity has a proxy value sourced from the Social Value Engine, GOV.UK, or peer-reviewed UK research. Hour-based activities use the per-hour proxy; count-based activities use the per-unit proxy.",
  },
  {
    title: "2. Time contributed",
    formula: "Total volunteer hours × £12.21/hour",
    body: "Volunteer time is valued at the National Living Wage rate (GOV.UK, 2024/25). This recognises that freely given time has real economic value.",
  },
  {
    title: "3. Donations",
    formula: "Sum of money donated",
    body: "The direct monetary value of charitable donations users have logged. We do not multiply or weight donations.",
  },
  {
    title: "4. Personal growth",
    formula: "Total volunteer hours × £15/hour",
    body: "The employer-valued skills premium from volunteering, based on NCVO Time Well Spent (2023), which found employers value volunteering experience at an average £1,500/year — equivalent to £15/hour for someone giving 100 hours.",
  },
];

const FIELD_QUOTES = [
  {
    quote: "I get demotivated easily. The app is really helpful in times like this.",
    attribution: "Participant",
    site: "New Wortley Community Hub · April 2026",
  },
  {
    quote: "I understood my value, but this attached an equitable number I could use and think about.",
    attribution: "Participant",
    site: "Loughborough College · April 2026",
  },
  {
    quote: "A volunteer carer became visibly moved by her social value calculation and described the figure as deeply meaningful.",
    attribution: "Field trial observation",
    site: "New Wortley Community Hub · April 2026",
  },
];

const ADVISORY = {
  chair: {
    name: "David Emerson CBE",
    role: "Chair, My Impact Advisory Group",
    detail: "Chair of Carnegie UK. Former CEO of the Association of Charitable Foundations for 15 years. Former chair of three UK foundations and charities.",
  },
  members: [
    { name: "Lucinda Yeadon", role: "Former Leeds City Councillor for Kirkstall Ward (2008–2018), including three years as Deputy Leader." },
    { name: "Al Garthwaite", role: "Councillor representing Headingley." },
    { name: "Jesse Jackson", role: "Loughborough College." },
    { name: "Heather Arnatt", role: "Voluntary Centre Services." },
    { name: "Abigail Appleton", role: "HCA." },
    { name: "Chris Cowcher", role: "Ex-Plunkett UK." },
    { name: "James Tedder", role: "Loughborough College." },
  ],
};

const CITATIONS: { text: string; href?: string }[] = [
  { text: "Social Value Engine — UK accredited platform for social value measurement.", href: "https://www.socialvalueengine.com" },
  { text: "HM Treasury — The Green Book: Central Government Guidance on Appraisal and Evaluation (2022)." },
  { text: "Social Value International — Principles of Social Value and SROI accreditation framework.", href: "https://www.socialvalue.org.uk" },
  { text: "GOV.UK — National Living Wage rates (2024/25), £12.21/hour.", href: "https://www.gov.uk/national-minimum-wage-rates" },
  { text: "GOV.UK — Standard UK Landfill Tax (2025), £126.15/tonne.", href: "https://www.gov.uk/government/publications/rates-and-allowances-landfill-tax" },
  { text: "Greater Manchester Combined Authority — Unit Cost Database (2024)." },
  { text: "PSSRU / Carers UK — Unit Costs of Health and Social Care, informal carer estimates (2022).", href: "https://www.pssru.ac.uk" },
  { text: "Sport England — Active Lives data and social value research summary." },
  { text: "NCVO — Time Well Spent: Diversity and Volunteering (2023).", href: "https://www.ncvo.org.uk/" },
  { text: "Volunteer Scotland — Technical Report on the Wellbeing Value of Volunteering (2025)." },
  { text: "FareShare — Value of being supported by a food bank, £185/visit (2018).", href: "https://fareshare.org.uk" },
  { text: "The Wildlife Trusts — Network for Nature Annual Report Y1 (2025)." },
  { text: "Pro Bono Economics — The Economics of CATs: Power to Change (2020), TNL Community Fund." },
  { text: "Action for Children — Wheatley Children's Centre social value evaluation (2023)." },
  { text: "NEF / Refuge — Refuge SROI updated model findings (2021)." },
  { text: "United Nations — The 17 Sustainable Development Goals.", href: "https://sdgs.un.org/goals" },
];

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletText}>{children}</Text>
    </View>
  );
}

function PageFooter({ page, total }: { page: number; total: number }) {
  return (
    <View style={s.pageFooter}>
      <Text style={s.pageNumText}>My Impact · Methodology &amp; Evidence Pack</Text>
      <Text style={s.pageNumText}>{page} / {total}</Text>
    </View>
  );
}

function CoverPage({ date }: { date: string }) {
  return (
    <Page size="A4" style={s.coverPage}>
      <View style={s.coverInner}>
        <View>
          <View style={s.logoRow}>
            <Text style={s.logoMy}>My</Text>
            <Text style={s.logoImpact}>Impact</Text>
          </View>
          <Text style={s.coverTagline}>POWERED BY THE SOCIAL VALUE ENGINE</Text>
        </View>

        <View style={s.coverHero}>
          <Text style={s.coverEyebrow}>METHODOLOGY &amp; EVIDENCE PACK</Text>
          <Text style={s.coverHeadline}>
            Where every number{"\n"}
            <Text style={s.coverHeadlineAccent}>actually comes from.</Text>
          </Text>
          <Text style={s.coverBlurb}>
            How My Impact converts everyday acts of contribution into a defensible monetary
            figure: SROI methodology, accredited Social Value Engine proxies, UN SDG mapping,
            verification approach, field-evidence quotes, and the citations behind every number.
          </Text>
        </View>

        <View style={s.coverFooter}>
          <Text style={s.coverFooterText}>myimpact.uk</Text>
          <Text style={s.coverFooterText}>Issued {date}</Text>
        </View>
      </View>
    </Page>
  );
}

function MethodologyPage({ page, total }: { page: number; total: number }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.pageInner}>
        <View style={s.pageHeader}>
          <Text style={s.pageHeaderTitle}>Methodology summary</Text>
          <View style={s.pageHeaderLogo}>
            <Text style={s.logoMySmall}>My</Text>
            <Text style={s.logoImpactDark}>Impact</Text>
          </View>
        </View>

        <Text style={s.sectionEyebrow}>IN PLAIN ENGLISH</Text>
        <Text style={s.sectionH2}>The four-line version, before the detail.</Text>
        <View style={{ marginBottom: 18 }}>
          <Bullet><Text style={{ fontWeight: "bold" }}>We use the Social Value Engine.</Text> The UK's accredited library of social value proxies, used by councils and universities. We do not invent monetary values.</Bullet>
          <Bullet><Text style={{ fontWeight: "bold" }}>Each activity is tagged to one UN SDG.</Text> One activity, one Goal — no double counting across Goals.</Bullet>
          <Bullet><Text style={{ fontWeight: "bold" }}>We add four pillars.</Text> Activity impact, time at the National Living Wage, donations, and a personal-growth premium. The breakdown is always shown.</Bullet>
          <Bullet><Text style={{ fontWeight: "bold" }}>Today, contributions are self-reported.</Text> Org-side hours verification is on the roadmap and will give every record a verified status.</Bullet>
        </View>

        <Text style={s.sectionEyebrow}>HOW VALUE IS CALCULATED</Text>
        <Text style={s.sectionH2}>The four-pillar formula.</Text>
        {PILLARS.map((p) => (
          <View key={p.title} style={s.pillarCard}>
            <Text style={s.pillarTitle}>{p.title}</Text>
            <Text style={s.pillarFormula}>{p.formula}</Text>
            <Text style={s.pillarBody}>{p.body}</Text>
          </View>
        ))}

        <PageFooter page={page} total={total} />
      </View>
    </Page>
  );
}

function SourcesPage({ page, total }: { page: number; total: number }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.pageInner}>
        <View style={s.pageHeader}>
          <Text style={s.pageHeaderTitle}>Sources, mapping, verification</Text>
          <View style={s.pageHeaderLogo}>
            <Text style={s.logoMySmall}>My</Text>
            <Text style={s.logoImpactDark}>Impact</Text>
          </View>
        </View>

        <Text style={s.sectionEyebrow}>WHERE THE PROXIES COME FROM</Text>
        <Text style={s.sectionH2}>Sourced, never invented.</Text>
        <View style={{ marginBottom: 16 }}>
          <Bullet><Text style={{ fontWeight: "bold" }}>The Social Value Engine</Text> — UK accredited platform, grounded in HM Treasury Green Book methodology and Social Value International standards.</Bullet>
          <Bullet><Text style={{ fontWeight: "bold" }}>GOV.UK and HM Treasury sources</Text> — Standard UK Landfill Tax, National Living Wage, GMCA unit-cost database.</Bullet>
          <Bullet><Text style={{ fontWeight: "bold" }}>Peer-reviewed UK research</Text> — PSSRU informal carer costs, Sport England, NEF Refuge SROI, Pro Bono Economics, Volunteer Scotland, FareShare.</Bullet>
          <Bullet><Text style={{ fontWeight: "bold" }}>Sector-specific reports</Text> — The Wildlife Trusts' Network for Nature, NCVO Time Well Spent, Action for Children.</Bullet>
        </View>

        <Text style={s.sectionEyebrow}>UN SDG MAPPING</Text>
        <Text style={s.sectionH2}>One activity, one Goal.</Text>
        <Text style={s.bodyText}>
          Every activity is tagged with the single UN Sustainable Development Goal it
          contributes to most directly. We do not double-count across Goals, even when an
          activity is plausibly relevant to several. The proxy value must measure an outcome
          the SDG is concerned with — conservation volunteering, for example, is tagged Life on
          Land rather than Decent Work.
        </Text>

        <Text style={{ ...s.sectionEyebrow, marginTop: 6 }}>VERIFICATION</Text>
        <Text style={s.sectionH2}>Honest about the present, building toward verified.</Text>
        <Text style={s.bodyText}>
          Today, every figure is self-reported. Three measures keep numbers credible:
          conservative defaults and frequency caps, conservative proxy choice where multiples
          exist, and single-SDG attribution. Org-side hours verification is on the roadmap and
          will let funder reports show only verified contributions.
        </Text>

        <Text style={{ ...s.sectionEyebrow, marginTop: 6 }}>UNCERTAINTY</Text>
        <Text style={s.sectionH2}>Estimates, not invoices.</Text>
        <View>
          <Bullet><Text style={{ fontWeight: "bold" }}>Rounded</Text> to whole pounds in the UI; calculations carry two decimal places to avoid drift.</Bullet>
          <Bullet><Text style={{ fontWeight: "bold" }}>Conservative defaults</Text> set at the lower end of typical participation.</Bullet>
          <Bullet><Text style={{ fontWeight: "bold" }}>Per-activity transparency</Text> — every activity shows its proxy source, year and unit.</Bullet>
          <Bullet><Text style={{ fontWeight: "bold" }}>Refresh cadence</Text> — proxies reviewed at least annually and refreshed when sources update.</Bullet>
        </View>

        <PageFooter page={page} total={total} />
      </View>
    </Page>
  );
}

function FieldEvidencePage({ page, total }: { page: number; total: number }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.pageInner}>
        <View style={s.pageHeader}>
          <Text style={s.pageHeaderTitle}>Field evidence</Text>
          <View style={s.pageHeaderLogo}>
            <Text style={s.logoMySmall}>My</Text>
            <Text style={s.logoImpactDark}>Impact</Text>
          </View>
        </View>

        <Text style={s.sectionEyebrow}>FROM PILOT TRIALS</Text>
        <Text style={s.sectionH2}>Tested with real people. Here's what they said.</Text>
        <Text style={s.bodyText}>
          My Impact has been tested with users at Loughborough College, Leeds Youth Justice and
          Probation, and New Wortley Community Hub during April 2026. Quotes below are reproduced
          from facilitator notes and direct participant feedback.
        </Text>

        <View style={{ marginTop: 12 }}>
          {FIELD_QUOTES.map((q, i) => (
            <View key={i} style={s.quoteCard}>
              <Text style={s.quoteMark}>“</Text>
              <Text style={s.quoteText}>{q.quote}</Text>
              <Text style={s.quoteAttr}>{q.attribution}</Text>
              <Text style={s.quoteSite}>{q.site}</Text>
            </View>
          ))}
        </View>

        <PageFooter page={page} total={total} />
      </View>
    </Page>
  );
}

function AdvisoryPage({ page, total }: { page: number; total: number }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.pageInner}>
        <View style={s.pageHeader}>
          <Text style={s.pageHeaderTitle}>Advisory group</Text>
          <View style={s.pageHeaderLogo}>
            <Text style={s.logoMySmall}>My</Text>
            <Text style={s.logoImpactDark}>Impact</Text>
          </View>
        </View>

        <Text style={s.sectionEyebrow}>OVERSIGHT</Text>
        <Text style={s.sectionH2}>Guided by people who know the sector.</Text>
        <Text style={s.bodyText}>
          My Impact is overseen by an independent advisory group with deep expertise across civil
          society, philanthropy, education and community development.
        </Text>

        <View style={{ ...s.bioCard, marginTop: 12, backgroundColor: NAVY }}>
          <Text style={{ ...s.bioName, color: WHITE }}>{ADVISORY.chair.name}</Text>
          <Text style={{ ...s.bioRole, color: ORANGE }}>{ADVISORY.chair.role}</Text>
          <Text style={{ ...s.bioDetail, color: "rgba(255,255,255,0.8)" }}>{ADVISORY.chair.detail}</Text>
        </View>

        <Text style={{ ...s.sectionEyebrow, marginTop: 14 }}>ADVISORY MEMBERS</Text>
        {ADVISORY.members.map((m) => (
          <View key={m.name} style={s.bioCard}>
            <Text style={s.bioName}>{m.name}</Text>
            <Text style={s.bioDetail}>{m.role}</Text>
          </View>
        ))}

        <PageFooter page={page} total={total} />
      </View>
    </Page>
  );
}

function CitationsPage({ page, total, date }: { page: number; total: number; date: string }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.pageInner}>
        <View style={s.pageHeader}>
          <Text style={s.pageHeaderTitle}>Citations</Text>
          <View style={s.pageHeaderLogo}>
            <Text style={s.logoMySmall}>My</Text>
            <Text style={s.logoImpactDark}>Impact</Text>
          </View>
        </View>

        <Text style={s.sectionEyebrow}>FULL REFERENCE LIST</Text>
        <Text style={s.sectionH2}>Every external source we currently rely on.</Text>

        <View style={{ marginTop: 12 }}>
          {CITATIONS.map((c, i) => (
            <View key={i} style={s.citationItem}>
              <Text style={s.citationNum}>{i + 1}.</Text>
              <Text style={s.citationText}>
                {c.href ? (
                  <Link src={c.href} style={s.citationLink}>{c.text}</Link>
                ) : (
                  c.text
                )}
              </Text>
            </View>
          ))}
        </View>

        <Text style={{ ...s.bodyText, marginTop: 14, fontSize: 9.5, color: MUTED }}>
          Last updated: {date}. The most current version of this methodology, including any
          activity-level updates, is published at myimpact.uk/methodology.
        </Text>

        <PageFooter page={page} total={total} />
      </View>
    </Page>
  );
}

export interface EvidencePackOptions {
  date: string;
}

export function buildEvidencePackDocument(opts: EvidencePackOptions) {
  const total = 6;
  return (
    <Document
      title="My Impact — Methodology & Evidence Pack"
      author="My Impact"
      subject="Methodology, field evidence, advisory group and citations"
      creator="MyImpact"
    >
      <CoverPage date={opts.date} />
      <MethodologyPage page={2} total={total} />
      <SourcesPage page={3} total={total} />
      <FieldEvidencePage page={4} total={total} />
      <AdvisoryPage page={5} total={total} />
      <CitationsPage page={6} total={total} date={opts.date} />
    </Document>
  );
}
