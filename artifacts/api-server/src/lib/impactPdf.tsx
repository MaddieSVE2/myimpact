import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
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
  pageInner: {
    padding: 48,
    flex: 1,
  },
  coverInner: {
    padding: 48,
    flex: 1,
    justifyContent: "space-between",
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
  coverHeadline: {
    color: WHITE,
    fontSize: 36,
    fontFamily: "Outfit",
    fontWeight: "bold",
    letterSpacing: -1,
    lineHeight: 1.15,
    marginBottom: 16,
    maxWidth: 360,
  },
  coverValue: {
    color: ORANGE,
    fontSize: 52,
    fontFamily: "Outfit",
    fontWeight: "bold",
    letterSpacing: -2,
    marginBottom: 8,
  },
  coverLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 4,
  },
  coverName: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 14,
    fontFamily: "DM Sans",
    marginBottom: 4,
  },
  coverDate: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontFamily: "DM Sans",
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
  activityRow: {
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
  activityRank: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: NAVY,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  activityRankText: {
    color: WHITE,
    fontSize: 10,
    fontFamily: "DM Sans",
    fontWeight: "bold",
  },
  activityName: {
    flex: 1,
    fontSize: 11,
    color: NAVY,
    fontFamily: "DM Sans",
    fontWeight: "bold",
  },
  activityValue: {
    fontSize: 13,
    fontFamily: "Outfit",
    fontWeight: "bold",
    color: ORANGE,
    marginLeft: 12,
    marginRight: 8,
  },
  activityPct: {
    fontSize: 10,
    color: MUTED,
    fontFamily: "DM Sans",
    width: 40,
    textAlign: "right",
  },
  sdgCard: {
    backgroundColor: WHITE,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: CREAM_BORDER,
    flexDirection: "row",
    alignItems: "center",
  },
  sdgBadge: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  sdgBadgeText: {
    color: WHITE,
    fontSize: 7,
    fontFamily: "DM Sans",
    fontWeight: "bold",
    textAlign: "center",
  },
  sdgName: {
    flex: 1,
    fontSize: 11,
    color: NAVY,
    fontFamily: "DM Sans",
    fontWeight: "bold",
  },
  sdgValue: {
    fontSize: 13,
    fontFamily: "Outfit",
    fontWeight: "bold",
    color: ORANGE,
    marginLeft: 12,
    marginRight: 8,
  },
  sdgPct: {
    fontSize: 10,
    color: MUTED,
    fontFamily: "DM Sans",
    width: 40,
    textAlign: "right",
  },
  closingPage: {
    backgroundColor: NAVY,
    fontFamily: "DM Sans",
    padding: 0,
  },
  closingInner: {
    padding: 48,
    flex: 1,
    justifyContent: "space-between",
  },
  closingHero: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
  },
  closingHeadline: {
    color: WHITE,
    fontSize: 32,
    fontFamily: "Outfit",
    fontWeight: "bold",
    letterSpacing: -1,
    textAlign: "center",
    marginBottom: 24,
    maxWidth: 320,
  },
  closingValueLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 11,
    letterSpacing: 1,
    textAlign: "center",
    marginBottom: 8,
    fontFamily: "DM Sans",
  },
  closingValue: {
    color: ORANGE,
    fontSize: 48,
    fontFamily: "Outfit",
    fontWeight: "bold",
    letterSpacing: -2,
    textAlign: "center",
    marginBottom: 32,
  },
  closingNote: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 9.5,
    textAlign: "center",
    maxWidth: 360,
    lineHeight: 1.5,
    fontFamily: "DM Sans",
  },
  closingFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  pageNumText: {
    fontSize: 9,
    color: MUTED,
    fontFamily: "DM Sans",
  },
});

export interface PdfActivityBreakdown {
  activityId: string;
  activityName: string;
  category: string;
  sdg: string;
  sdgColor: string;
  impactValue: number;
  hours: number;
}

export interface PdfSdgBreakdown {
  sdg: string;
  sdgColor: string;
  value: number;
}

export interface PdfData {
  userName: string;
  date: string;
  totalValue: number;
  impactValue: number;
  contributionValue: number;
  donationsValue: number;
  personalDevelopmentValue: number;
  totalHours: number;
  activityBreakdowns: PdfActivityBreakdown[];
  sdgBreakdowns: PdfSdgBreakdown[];
}

function isObjectWithKey(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function toNumber(val: unknown): number {
  if (typeof val === "number" && isFinite(val)) return val;
  if (typeof val === "string") {
    const n = parseFloat(val);
    if (isFinite(n)) return n;
  }
  return 0;
}

function toString(val: unknown): string {
  if (typeof val === "string") return val;
  return "";
}

function parseActivityBreakdown(item: unknown): PdfActivityBreakdown {
  const obj = isObjectWithKey(item) ? item : {};
  return {
    activityId: toString(obj.activityId),
    activityName: toString(obj.activityName),
    category: toString(obj.category),
    sdg: toString(obj.sdg),
    sdgColor: toString(obj.sdgColor) || "#4C9F38",
    impactValue: toNumber(obj.impactValue),
    hours: toNumber(obj.hours),
  };
}

function parseSdgBreakdown(item: unknown): PdfSdgBreakdown {
  const obj = isObjectWithKey(item) ? item : {};
  return {
    sdg: toString(obj.sdg),
    sdgColor: toString(obj.sdgColor) || "#4C9F38",
    value: toNumber(obj.value),
  };
}

export function parsePdfData(
  raw: unknown,
  userName: string,
  date: string
): PdfData {
  const obj = isObjectWithKey(raw) ? raw : {};

  const activityBreakdowns: PdfActivityBreakdown[] = Array.isArray(obj.activityBreakdowns)
    ? obj.activityBreakdowns.map(parseActivityBreakdown)
    : [];

  const sdgBreakdowns: PdfSdgBreakdown[] = Array.isArray(obj.sdgBreakdowns)
    ? obj.sdgBreakdowns.map(parseSdgBreakdown)
    : [];

  return {
    userName,
    date,
    totalValue: toNumber(obj.totalValue),
    impactValue: toNumber(obj.impactValue),
    contributionValue: toNumber(obj.contributionValue),
    donationsValue: toNumber(obj.donationsValue),
    personalDevelopmentValue: toNumber(obj.personalDevelopmentValue),
    totalHours: toNumber(obj.totalHours),
    activityBreakdowns,
    sdgBreakdowns,
  };
}

function CoverPage({ data }: { data: PdfData }) {
  return (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverInner}>
        <View>
          <View style={styles.logoRow}>
            <Text style={styles.logoMy}>My</Text>
            <Text style={styles.logoImpact}>Impact</Text>
          </View>
          <Text style={styles.coverTagline}>POWERED BY THE SOCIAL VALUE ENGINE</Text>
        </View>

        <View style={styles.coverHero}>
          <Text style={styles.coverLabel}>TOTAL VERIFIED SOCIAL VALUE</Text>
          <Text style={styles.coverValue}>{formatCurrency(data.totalValue)}</Text>
          <Text style={{ ...styles.coverHeadline, marginTop: 16 }}>
            The Difference I Make
          </Text>
          <Text style={styles.coverName}>{data.userName}</Text>
          <Text style={styles.coverDate}>{data.date}</Text>
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

function MetricsPage({ data }: { data: PdfData }) {
  const metrics = [
    {
      label: "IMPACT OF ACTIVITIES",
      value: data.impactValue,
      subtitle: "Direct social value from your activities",
    },
    {
      label: "TIME CONTRIBUTED",
      value: data.contributionValue,
      subtitle: `${Math.round(data.totalHours)} volunteer hours at \u00a312.21/hr`,
    },
    {
      label: "DONATIONS",
      value: data.donationsValue,
      subtitle: "Money donated to good causes",
    },
    {
      label: "PERSONAL GROWTH",
      value: data.personalDevelopmentValue,
      subtitle: "Employer-valued skills developed",
    },
  ];

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageInner}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageHeaderTitle}>How I Create Value</Text>
          <View style={styles.pageHeaderLogo}>
            <Text style={styles.pageHeaderLogoMy}>My</Text>
            <Text style={styles.pageHeaderLogoImpact}>Impact</Text>
          </View>
        </View>

        <View style={styles.metricGrid}>
          {metrics.map((m) => (
            <View key={m.label} style={styles.metricCard}>
              <Text style={styles.metricLabel}>{m.label}</Text>
              <Text style={styles.metricValue}>{formatCurrency(m.value)}</Text>
              <Text style={styles.metricSubtitle}>{m.subtitle}</Text>
            </View>
          ))}
        </View>

        <View
          style={{
            backgroundColor: WHITE,
            borderRadius: 10,
            padding: 16,
            borderWidth: 1,
            borderColor: CREAM_BORDER,
            marginTop: 8,
          }}
        >
          <Text style={{ fontSize: 10, fontFamily: "DM Sans", fontWeight: "bold", color: NAVY, marginBottom: 6 }}>
            Total Verified Social Value
          </Text>
          <Text style={{ fontSize: 32, fontFamily: "Outfit", fontWeight: "bold", color: ORANGE, letterSpacing: -1 }}>
            {formatCurrency(data.totalValue)}
          </Text>
          <Text style={{ fontSize: 10, color: DARK_MUTED, marginTop: 6, fontFamily: "DM Sans" }}>
            Combined value across all four pillars of impact
          </Text>
        </View>

        <Text style={{ ...styles.pageNumText, marginTop: 12 }}>2 / 5</Text>
      </View>
    </Page>
  );
}

function ActivitiesPage({ data }: { data: PdfData }) {
  const sorted = [...data.activityBreakdowns]
    .sort((a, b) => b.impactValue - a.impactValue)
    .slice(0, 10);

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageInner}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageHeaderTitle}>My Activities</Text>
          <View style={styles.pageHeaderLogo}>
            <Text style={styles.pageHeaderLogoMy}>My</Text>
            <Text style={styles.pageHeaderLogoImpact}>Impact</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Top activities by social value</Text>

        {sorted.length === 0 ? (
          <Text style={{ fontSize: 11, color: MUTED, fontFamily: "DM Sans" }}>No activities recorded.</Text>
        ) : (
          sorted.map((a, i) => {
            const pct =
              data.totalValue > 0
                ? Math.round((a.impactValue / data.totalValue) * 100)
                : 0;
            return (
              <View key={a.activityId || String(i)} style={styles.activityRow}>
                <View style={styles.activityRank}>
                  <Text style={styles.activityRankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityName}>
                    {a.activityName}
                  </Text>
                </View>
                <Text style={styles.activityValue}>{formatCurrency(a.impactValue)}</Text>
                <Text style={styles.activityPct}>{pct}%</Text>
              </View>
            );
          })
        )}

        <Text style={{ ...styles.pageNumText, marginTop: 8 }}>3 / 5</Text>
      </View>
    </Page>
  );
}

function SdgPage({ data }: { data: PdfData }) {
  const sorted = [...data.sdgBreakdowns].sort((a, b) => b.value - a.value);

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageInner}>
        <View style={styles.pageHeader}>
          <Text style={styles.pageHeaderTitle}>UN SDGs I Support</Text>
          <View style={styles.pageHeaderLogo}>
            <Text style={styles.pageHeaderLogoMy}>My</Text>
            <Text style={styles.pageHeaderLogoImpact}>Impact</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Sustainable Development Goals aligned to my activities</Text>

        {sorted.length === 0 ? (
          <Text style={{ fontSize: 11, color: MUTED, fontFamily: "DM Sans" }}>No SDG data available.</Text>
        ) : (
          sorted.map((s, i) => {
            const pct =
              data.totalValue > 0
                ? Math.round((s.value / data.totalValue) * 100)
                : 0;
            const sdgWords = s.sdg.split(" ");
            const badgeLabel = sdgWords.slice(0, 2).join(" ");
            return (
              <View key={s.sdg || String(i)} style={styles.sdgCard}>
                <View style={{ ...styles.sdgBadge, backgroundColor: s.sdgColor || NAVY }}>
                  <Text style={styles.sdgBadgeText}>
                    {badgeLabel}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sdgName}>
                    {s.sdg}
                  </Text>
                </View>
                <Text style={styles.sdgValue}>{formatCurrency(s.value)}</Text>
                <Text style={styles.sdgPct}>{pct}%</Text>
              </View>
            );
          })
        )}

        <View
          style={{
            marginTop: 12,
            padding: 12,
            backgroundColor: WHITE,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: CREAM_BORDER,
          }}
        >
          <Text style={{ fontSize: 9, color: DARK_MUTED, lineHeight: 1.5, fontFamily: "DM Sans" }}>
            The UN Sustainable Development Goals (SDGs) are 17 global goals adopted by world
            leaders to end poverty, protect the planet, and ensure prosperity for all by 2030.
            Your activities directly contribute to multiple goals.
          </Text>
        </View>

        <Text style={{ ...styles.pageNumText, marginTop: 8 }}>4 / 5</Text>
      </View>
    </Page>
  );
}

function ClosingPage({ data }: { data: PdfData }) {
  return (
    <Page size="A4" style={styles.closingPage}>
      <View style={styles.closingInner}>
        <View style={styles.logoRow}>
          <Text style={styles.logoMy}>My</Text>
          <Text style={styles.logoImpact}>Impact</Text>
        </View>

        <View style={styles.closingHero}>
          <Text style={styles.closingHeadline}>The Difference I Make</Text>
          <Text style={styles.closingValueLabel}>TOTAL VERIFIED SOCIAL VALUE</Text>
          <Text style={styles.closingValue}>{formatCurrency(data.totalValue)}</Text>
          <Text style={styles.closingNote}>
            This figure has been calculated using the Social Return on Investment (SROI)
            methodology. Each activity is matched to a peer-reviewed Social Value Engine proxy
            based on UK government data and academic research. The value represents the
            verified social and economic benefit of the activities listed in this report.
          </Text>
        </View>

        <View style={styles.closingFooter}>
          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, fontFamily: "DM Sans" }}>
            myimpact.social
          </Text>
          <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, textAlign: "right", fontFamily: "DM Sans" }}>
            5 / 5
          </Text>
        </View>
      </View>
    </Page>
  );
}

export function buildImpactDocument(data: PdfData) {
  return (
    <Document
      title="My Impact Report"
      author={data.userName}
      subject="Social Value Impact Report"
      creator="MyImpact"
    >
      <CoverPage data={data} />
      <MetricsPage data={data} />
      <ActivitiesPage data={data} />
      <SdgPage data={data} />
      <ClosingPage data={data} />
    </Document>
  );
}
