import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
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

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `\u00a3${(value / 1_000_000).toFixed(2)}m`;
  }
  if (value >= 10_000) {
    return `\u00a3${(value / 1_000).toFixed(1)}k`;
  }
  return `\u00a3${Math.round(value).toLocaleString("en-GB")}`;
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: CREAM,
    fontFamily: "DM Sans",
    padding: 0,
  },
  coverPage: {
    backgroundColor: NAVY,
    fontFamily: "DM Sans",
    padding: 0,
  },
  coverInner: {
    padding: 48,
    flex: 1,
    justifyContent: "space-between",
  },
  pageInner: {
    padding: 48,
    flex: 1,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  logoMy: {
    color: ORANGE,
    fontSize: 18,
    fontFamily: "Outfit",
    fontWeight: "bold",
  },
  logoImpact: {
    color: WHITE,
    fontSize: 18,
    fontFamily: "Outfit",
    fontWeight: "bold",
  },
  coverTagline: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 9,
    letterSpacing: 2,
  },
  coverHero: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 40,
  },
  coverLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 4,
  },
  coverValue: {
    color: ORANGE,
    fontSize: 52,
    fontFamily: "Outfit",
    fontWeight: "bold",
    letterSpacing: -2,
    marginBottom: 8,
  },
  coverOrgName: {
    color: WHITE,
    fontSize: 28,
    fontFamily: "Outfit",
    fontWeight: "bold",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  coverPeriod: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 12,
    fontFamily: "DM Sans",
    marginBottom: 4,
  },
  coverOrgType: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontFamily: "DM Sans",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  coverFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  coverFooterUrl: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
  },
  coverFooterSroi: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 9,
    textAlign: "right",
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 32,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: CREAM_BORDER,
  },
  pageHeaderTitle: {
    fontSize: 22,
    fontFamily: "Outfit",
    fontWeight: "bold",
    color: NAVY,
    letterSpacing: -0.5,
  },
  pageHeaderLogo: {
    flexDirection: "row",
    alignItems: "center",
  },
  pageHeaderLogoMy: {
    color: ORANGE,
    fontSize: 12,
    fontFamily: "Outfit",
    fontWeight: "bold",
  },
  pageHeaderLogoImpact: {
    color: NAVY,
    fontSize: 12,
    fontFamily: "Outfit",
    fontWeight: "bold",
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 24,
  },
  metricCard: {
    backgroundColor: WHITE,
    borderRadius: 10,
    padding: 16,
    flex: 1,
    minWidth: "45%",
    borderWidth: 1,
    borderColor: CREAM_BORDER,
  },
  metricLabel: {
    fontSize: 9,
    color: MUTED,
    letterSpacing: 1,
    marginBottom: 6,
    fontFamily: "DM Sans",
  },
  metricValue: {
    fontSize: 24,
    fontFamily: "Outfit",
    fontWeight: "bold",
    color: ORANGE,
    marginBottom: 4,
  },
  metricSubtitle: {
    fontSize: 9,
    color: DARK_MUTED,
    fontFamily: "DM Sans",
  },
  sectionLabel: {
    fontSize: 10,
    fontFamily: "DM Sans",
    fontWeight: "bold",
    color: MUTED,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: WHITE,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: CREAM_BORDER,
  },
  categoryName: {
    flex: 1,
    fontSize: 11,
    color: NAVY,
    fontFamily: "DM Sans",
    fontWeight: "bold",
  },
  categoryValue: {
    fontSize: 13,
    fontFamily: "Outfit",
    fontWeight: "bold",
    color: ORANGE,
    marginLeft: 12,
    marginRight: 8,
  },
  categoryPct: {
    fontSize: 10,
    color: MUTED,
    fontFamily: "DM Sans",
    width: 40,
    textAlign: "right",
  },
  barBg: {
    height: 4,
    backgroundColor: CREAM_BORDER,
    borderRadius: 2,
    marginTop: 6,
    overflow: "hidden",
  },
  pageNumText: {
    fontSize: 9,
    color: MUTED,
    fontFamily: "DM Sans",
  },
  noteBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: WHITE,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CREAM_BORDER,
  },
  noteText: {
    fontSize: 9,
    color: DARK_MUTED,
    lineHeight: 1.5,
    fontFamily: "DM Sans",
  },
});

export interface OrgSdgBreakdown {
  sdg: string;
  sdgColor: string;
  value: number;
}

export interface OrgPdfBranding {
  // data: URL (e.g. "data:image/png;base64,...") for the org's uploaded logo,
  // or null when the org has not uploaded a logo. We embed as a data URL so
  // @react-pdf/renderer can render it without an extra HTTP fetch.
  logoDataUrl: string | null;
  // Hex strings (e.g. "#0EA5E9") or null to fall back to the My Impact orange.
  brandPrimary: string | null;
  brandAccent: string | null;
}

export interface OrgPdfSroiBreakdown {
  recruitment?: number | null;
  onboarding?: number | null;
  support?: number | null;
  admin?: number | null;
}

export interface OrgPdfData {
  orgName: string;
  orgType: string;
  period: string;
  totalSocialValue: number;
  totalHours: number;
  verifiedHours: number;
  verifiedSocialValue: number;
  verifiedRecordCount: number;
  totalMemberCount: number;
  totalUsers: number;
  averageValuePerPerson: number;
  valueByCategory: Array<{ category: string; value: number }>;
  sdgBreakdowns: OrgSdgBreakdown[];
  sroiCostPerVolunteer?: number | null;
  sroiCostBreakdown?: OrgPdfSroiBreakdown | null;
  branding?: OrgPdfBranding;
}

function CoverPage({ data }: { data: OrgPdfData }) {
  const primary = data.branding?.brandPrimary || ORANGE;
  const logo = data.branding?.logoDataUrl || null;
  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverInner}>
        <View>
          {logo ? (
            <Image src={logo} style={{ maxWidth: 140, maxHeight: 60, marginBottom: 8 }} />
          ) : (
            <View style={styles.logoRow}>
              <Text style={{ ...styles.logoMy, color: primary }}>My</Text>
              <Text style={styles.logoImpact}>Impact</Text>
            </View>
          )}
          <Text style={styles.coverTagline}>ORGANISATION IMPACT REPORT</Text>
        </View>

        <View style={styles.coverHero}>
          <Text style={styles.coverLabel}>TOTAL SOCIAL VALUE</Text>
          <Text style={{ ...styles.coverValue, color: primary }}>{formatCurrency(data.totalSocialValue)}</Text>
          <Text style={styles.coverOrgName}>{data.orgName}</Text>
          <Text style={styles.coverPeriod}>{data.period}</Text>
          <Text style={styles.coverOrgType}>{data.orgType}</Text>
        </View>

        <View style={styles.coverFooter}>
          <Text style={styles.coverFooterUrl}>myimpact.social</Text>
          <Text style={styles.coverFooterSroi}>
            Calculated using Social Return{"\n"}on Investment methodology
          </Text>
        </View>
      </View>
    </Page>
  );
}

function PageHeader({ data, title }: { data: OrgPdfData; title: string }) {
  const primary = data.branding?.brandPrimary || ORANGE;
  const logo = data.branding?.logoDataUrl || null;
  // Section headers carry the org's primary colour on both the title and the
  // bottom rule so the brand reads on every page (not just metric values).
  return (
    <View style={{ ...styles.pageHeader, borderBottomColor: primary, borderBottomWidth: 2 }}>
      <Text style={{ ...styles.pageHeaderTitle, color: primary }}>{title}</Text>
      {logo ? (
        <Image src={logo} style={{ maxWidth: 90, maxHeight: 36 }} />
      ) : (
        <View style={styles.pageHeaderLogo}>
          <Text style={{ ...styles.pageHeaderLogoMy, color: primary }}>My</Text>
          <Text style={styles.pageHeaderLogoImpact}>Impact</Text>
        </View>
      )}
    </View>
  );
}

function SroiBlock({ data }: { data: OrgPdfData }) {
  const primary = data.branding?.brandPrimary || ORANGE;
  const cost = data.sroiCostPerVolunteer;
  if (typeof cost !== "number") return null;
  const b = data.sroiCostBreakdown ?? null;
  const lines: Array<{ label: string; value: number }> = [];
  if (b) {
    if (typeof b.recruitment === "number") lines.push({ label: "Recruitment", value: b.recruitment });
    if (typeof b.onboarding === "number")  lines.push({ label: "Onboarding",  value: b.onboarding });
    if (typeof b.support === "number")     lines.push({ label: "Support",     value: b.support });
    if (typeof b.admin === "number")       lines.push({ label: "Admin",       value: b.admin });
  }
  return (
    <View style={{ ...styles.metricCard, marginBottom: 16 }} data-testid="pdf-sroi-cost-block">
      <Text style={styles.metricLabel}>ORG. INVESTMENT PER VOLUNTEER</Text>
      <Text style={{ ...styles.metricValue, color: primary }}>{formatCurrency(cost)}</Text>
      <Text style={styles.metricSubtitle}>Annual cost used to calculate the SROI ratio</Text>
      {lines.length > 0 && (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: CREAM_BORDER }}>
          {lines.map(l => (
            <View
              key={l.label}
              style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}
            >
              <Text style={{ fontSize: 10, color: DARK_MUTED, fontFamily: "DM Sans" }}>{l.label}</Text>
              <Text style={{ fontSize: 10, color: NAVY, fontFamily: "DM Sans", fontWeight: "bold" }}>
                {formatCurrency(l.value)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function StatsPage({ data }: { data: OrgPdfData }) {
  const primary = data.branding?.brandPrimary || ORANGE;
  const metrics = [
    {
      label: "TOTAL SOCIAL VALUE",
      value: formatCurrency(data.totalSocialValue),
      subtitle: "Aggregate verified social value",
    },
    {
      label: "MEMBERS",
      value: String(data.totalMemberCount),
      subtitle: `${data.totalUsers} with saved impact records`,
    },
    {
      label: "AVG VALUE PER PERSON",
      value: formatCurrency(data.averageValuePerPerson),
      subtitle: "Average across active members",
    },
    {
      label: "TOTAL HOURS GIVEN",
      value: `${Math.round(data.totalHours).toLocaleString("en-GB")}`,
      subtitle: "Volunteering hours across all members",
    },
    {
      label: "VERIFIED HOURS",
      value: `${Math.round(data.verifiedHours).toLocaleString("en-GB")}`,
      subtitle: `Org-attested (${data.verifiedRecordCount} ${data.verifiedRecordCount === 1 ? "record" : "records"})`,
    },
    {
      label: "VERIFIED SOCIAL VALUE",
      value: formatCurrency(data.verifiedSocialValue),
      subtitle: "Funder-ready, attested by your org",
    },
  ];

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageInner}>
        <PageHeader data={data} title="Headline Stats" />

        <View style={styles.metricGrid}>
          {metrics.map(m => (
            <View key={m.label} style={styles.metricCard}>
              <Text style={styles.metricLabel}>{m.label}</Text>
              <Text style={{ ...styles.metricValue, color: primary }}>{m.value}</Text>
              <Text style={styles.metricSubtitle}>{m.subtitle}</Text>
            </View>
          ))}
        </View>

        <SroiBlock data={data} />

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>
            Report period: {data.period}. Data is anonymised — the organisation sees totals and
            categories only, never individual names or personal information. Values are calculated
            using the Social Return on Investment (SROI) methodology.
          </Text>
        </View>

        <Text style={{ ...styles.pageNumText, marginTop: 12 }}>2 / 4</Text>
      </View>
    </Page>
  );
}

function CategoryPage({ data }: { data: OrgPdfData }) {
  const sorted = [...data.valueByCategory].sort((a, b) => b.value - a.value);
  const primary = data.branding?.brandPrimary || ORANGE;

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageInner}>
        <PageHeader data={data} title="Social Value by Category" />

        <Text style={styles.sectionLabel}>Breakdown of social value by activity category</Text>

        {sorted.length === 0 ? (
          <Text style={{ fontSize: 11, color: MUTED, fontFamily: "DM Sans" }}>No activity data for this period.</Text>
        ) : (
          sorted.map((cat, i) => {
            const pct = data.totalSocialValue > 0
              ? Math.round((cat.value / data.totalSocialValue) * 100)
              : 0;
            return (
              <View key={cat.category || String(i)} style={styles.categoryRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryName}>{cat.category}</Text>
                  <View style={styles.barBg}>
                    <View
                      style={{
                        height: 4,
                        backgroundColor: primary,
                        borderRadius: 2,
                        width: `${Math.min(pct, 100)}%`,
                      }}
                    />
                  </View>
                </View>
                <Text style={{ ...styles.categoryValue, color: primary }}>{formatCurrency(cat.value)}</Text>
                <Text style={styles.categoryPct}>{pct}%</Text>
              </View>
            );
          })
        )}

        <Text style={{ ...styles.pageNumText, marginTop: 8 }}>3 / 4</Text>
      </View>
    </Page>
  );
}

function SdgPage({ data }: { data: OrgPdfData }) {
  const sorted = [...data.sdgBreakdowns].sort((a, b) => b.value - a.value);
  const primary = data.branding?.brandPrimary || ORANGE;

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageInner}>
        <PageHeader data={data} title="UN SDG Alignment" />

        <Text style={styles.sectionLabel}>Sustainable Development Goals supported by members</Text>

        {sorted.length === 0 ? (
          <Text style={{ fontSize: 11, color: MUTED, fontFamily: "DM Sans" }}>No SDG data for this period.</Text>
        ) : (
          sorted.map((s, i) => {
            const pct = data.totalSocialValue > 0
              ? Math.round((s.value / data.totalSocialValue) * 100)
              : 0;
            const sdgWords = s.sdg.split(" ");
            const badgeLabel = sdgWords.slice(0, 2).join(" ");
            return (
              <View key={s.sdg || String(i)} style={styles.categoryRow}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: s.sdgColor || NAVY,
                    justifyContent: "center",
                    alignItems: "center",
                    marginRight: 12,
                    flexShrink: 0,
                  }}
                >
                  <Text style={{ color: WHITE, fontSize: 7, fontFamily: "DM Sans", fontWeight: "bold", textAlign: "center" }}>
                    {badgeLabel}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.categoryName}>{s.sdg}</Text>
                  <View style={styles.barBg}>
                    <View
                      style={{
                        height: 4,
                        backgroundColor: s.sdgColor || ORANGE,
                        borderRadius: 2,
                        width: `${Math.min(pct, 100)}%`,
                      }}
                    />
                  </View>
                </View>
                <Text style={{ ...styles.categoryValue, color: primary }}>{formatCurrency(s.value)}</Text>
                <Text style={styles.categoryPct}>{pct}%</Text>
              </View>
            );
          })
        )}

        <View style={{ ...styles.noteBox, marginTop: 16 }}>
          <Text style={styles.noteText}>
            The UN Sustainable Development Goals (SDGs) are 17 global goals adopted by world
            leaders to end poverty, protect the planet, and ensure prosperity for all by 2030.
            Members' activities directly contribute to multiple goals. All data is anonymised.
            Generated by My Impact · myimpact.social
          </Text>
        </View>

        <Text style={{ ...styles.pageNumText, marginTop: 8 }}>4 / 4</Text>
      </View>
    </Page>
  );
}

export function buildOrgDocument(data: OrgPdfData) {
  return (
    <Document
      title={`${data.orgName} — Impact Report`}
      author={data.orgName}
      subject="Organisation Social Value Impact Report"
      creator="MyImpact"
    >
      <CoverPage data={data} />
      <StatsPage data={data} />
      <CategoryPage data={data} />
      <SdgPage data={data} />
    </Document>
  );
}
