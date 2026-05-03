import React from "react";
import {
  Document,
  Page,
  Text,
  Image,
  View,
  StyleSheet,
  Font,
  renderToFile,
  Svg,
  Path,
} from "@react-pdf/renderer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), "../../../..");

const LOGO = path.join(ROOT, "artifacts/my-impact/public/images/myimpact.png");
const SCREENSHOT = path.join(ROOT, "attached_assets/onepager/screenshot_home.jpg");
const OUT = path.join(ROOT, "attached_assets/onepager/MyImpact_OnePager.pdf");

const ORANGE = "#E8633A";
const NAVY = "#213547";
const CREAM = "#F7F5EF";
const OLIVE = "#B5BE2E";
const SLATE = "#7E8FAD";
const LIGHT_BLUE = "#A8C8DA";
const WHITE = "#FFFFFF";
const MUTED = "#5A6572";

Font.register({
  family: "Outfit",
  fonts: [
    { src: "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4deyC4E.ttf", fontWeight: 700 },
  ],
});

Font.register({
  family: "DM Sans",
  fonts: [
    { src: "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAopxhTg.ttf", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwARZthTg.ttf", fontWeight: 700 },
  ],
});

const s = StyleSheet.create({
  page: {
    backgroundColor: CREAM,
    fontFamily: "DM Sans",
    color: NAVY,
    padding: 0,
  },
  // Header band
  header: {
    backgroundColor: NAVY,
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
  },
  headerAccent: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: 18,
    backgroundColor: ORANGE,
  },
  logoImg: {
    height: 40,
    width: 70,
  },
  headerTagline: {
    color: CREAM,
    fontSize: 9,
    fontFamily: "Outfit",
    fontWeight: 600,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    opacity: 0.85,
  },
  // Hero
  hero: {
    paddingTop: 22,
    paddingHorizontal: 36,
    paddingBottom: 4,
  },
  eyebrow: {
    fontSize: 8.5,
    fontFamily: "Outfit",
    fontWeight: 700,
    color: ORANGE,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  headline: {
    fontSize: 30,
    fontFamily: "Outfit",
    fontWeight: 700,
    color: NAVY,
    lineHeight: 1.05,
    letterSpacing: -0.5,
  },
  headlineAccent: {
    color: ORANGE,
  },
  subhead: {
    fontSize: 11,
    color: MUTED,
    marginTop: 12,
    lineHeight: 1.55,
    maxWidth: 470,
  },
  // Two column body
  body: {
    flexDirection: "row",
    paddingHorizontal: 36,
    paddingTop: 18,
    gap: 22,
  },
  leftCol: {
    width: "55%",
  },
  rightCol: {
    width: "45%",
  },
  // Screenshot card
  screenshotCard: {
    backgroundColor: WHITE,
    borderRadius: 10,
    padding: 6,
    borderWidth: 1,
    borderColor: "#E8E5DE",
  },
  screenshotImg: {
    width: "100%",
    borderRadius: 6,
    objectFit: "cover",
  },
  screenshotCaption: {
    fontSize: 8.5,
    color: MUTED,
    marginTop: 8,
    textAlign: "center",
    fontFamily: "Outfit",
    fontWeight: 600,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  // Feature list
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Outfit",
    fontWeight: 700,
    color: NAVY,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  featureRow: {
    flexDirection: "row",
    marginBottom: 12,
    alignItems: "flex-start",
  },
  bullet: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: ORANGE,
    marginRight: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bulletAlt: {
    backgroundColor: OLIVE,
  },
  bulletAlt2: {
    backgroundColor: LIGHT_BLUE,
  },
  bulletAlt3: {
    backgroundColor: SLATE,
  },
  bulletText: {
    color: WHITE,
    fontSize: 9,
    fontFamily: "Outfit",
    fontWeight: 700,
  },
  featureBody: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 10.5,
    fontFamily: "Outfit",
    fontWeight: 700,
    color: NAVY,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 9.5,
    color: MUTED,
    lineHeight: 1.45,
  },
  // Stats strip
  statsStrip: {
    marginTop: 14,
    marginHorizontal: 36,
    backgroundColor: NAVY,
    borderRadius: 10,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  stat: {
    alignItems: "flex-start",
    flex: 1,
  },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginHorizontal: 8,
  },
  statValue: {
    fontSize: 18,
    fontFamily: "Outfit",
    fontWeight: 700,
    color: ORANGE,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 8,
    color: CREAM,
    fontFamily: "Outfit",
    fontWeight: 600,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    opacity: 0.85,
  },
  // Who uses
  whoStrip: {
    marginTop: 14,
    marginHorizontal: 36,
    flexDirection: "row",
    gap: 10,
  },
  whoCard: {
    flex: 1,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: "#E8E5DE",
    borderRadius: 8,
    padding: 12,
  },
  whoTitle: {
    fontSize: 10,
    fontFamily: "Outfit",
    fontWeight: 700,
    color: NAVY,
    marginBottom: 4,
  },
  whoDesc: {
    fontSize: 8.5,
    color: MUTED,
    lineHeight: 1.4,
  },
  // Footer
  footer: {
    marginTop: 14,
    backgroundColor: NAVY,
    paddingTop: 14,
    paddingBottom: 14,
    paddingHorizontal: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  footerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  footerLabel: {
    fontSize: 8.5,
    color: CREAM,
    opacity: 0.7,
    fontFamily: "Outfit",
    fontWeight: 600,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  footerValue: {
    fontSize: 12,
    color: WHITE,
    fontFamily: "Outfit",
    fontWeight: 700,
  },
  footerOrange: {
    color: ORANGE,
  },
  ctaPill: {
    backgroundColor: ORANGE,
    borderRadius: 100,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  ctaText: {
    color: WHITE,
    fontSize: 10.5,
    fontFamily: "Outfit",
    fontWeight: 700,
    letterSpacing: 0.4,
  },
});

function Feature({
  num,
  title,
  desc,
  variant = 0,
}: {
  num: string;
  title: string;
  desc: string;
  variant?: number;
}) {
  const variantStyle =
    variant === 1 ? s.bulletAlt : variant === 2 ? s.bulletAlt2 : variant === 3 ? s.bulletAlt3 : null;
  return (
    <View style={s.featureRow}>
      <View style={[s.bullet, variantStyle].filter(Boolean) as any}>
        <Text style={s.bulletText}>{num}</Text>
      </View>
      <View style={s.featureBody}>
        <Text style={s.featureTitle}>{title}</Text>
        <Text style={s.featureDesc}>{desc}</Text>
      </View>
    </View>
  );
}

function OnePager() {
  return (
    <Document title="My Impact — One-Pager" author="My Impact">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerAccent} />
          <Image src={LOGO} style={s.logoImg} />
          <Text style={s.headerTagline}>Powered by the Social Value Engine</Text>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.eyebrow}>Volunteering · Donations · Community</Text>
          <Text style={s.headline}>
            You already make a difference.{"\n"}
            Now <Text style={s.headlineAccent}>prove it.</Text>
          </Text>
          <Text style={s.subhead}>
            My Impact turns the time you give and the help you offer into a clear monetary
            value, in pounds, using the Social Value Engine. Track it, share it, celebrate it
            — and show employers, funders or yourself the difference you make.
          </Text>
        </View>

        {/* Body */}
        <View style={s.body}>
          <View style={s.leftCol}>
            <Text style={s.sectionTitle}>How it works</Text>
            <Feature
              num="1"
              title="Log what you do"
              desc="Choose from dozens of recognised volunteering and community activities, and add your hours, donations and reflections in a few taps."
              variant={0}
            />
            <Feature
              num="2"
              title="See your social value"
              desc="We calculate the financial value of your contribution using research-backed proxies from the Social Value Engine and government data."
              variant={1}
            />
            <Feature
              num="3"
              title="Build your impact story"
              desc="Earn milestones, keep a private journal, and generate a polished PDF report you can share with employers, schools or funders."
              variant={2}
            />
            <Feature
              num="4"
              title="Connect with your organisation"
              desc="Schools, employers and community groups can verify hours, run challenges and see aggregate impact across their members."
              variant={3}
            />
          </View>
          <View style={s.rightCol}>
            <View style={s.screenshotCard}>
              <Image src={SCREENSHOT} style={s.screenshotImg} />
            </View>
            <Text style={s.screenshotCaption}>myimpact.uk</Text>
          </View>
        </View>

        {/* Stats strip */}
        <View style={s.statsStrip}>
          <View style={s.stat}>
            <Text style={s.statValue}>£12.21/hr</Text>
            <Text style={s.statLabel}>National Living Wage baseline</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>17 SDGs</Text>
            <Text style={s.statLabel}>Mapped to UN goals</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>50+</Text>
            <Text style={s.statLabel}>Recognised activities</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>Free</Text>
            <Text style={s.statLabel}>For individuals, forever</Text>
          </View>
        </View>

        {/* Who it's for */}
        <View style={s.whoStrip}>
          <View style={s.whoCard}>
            <Text style={s.whoTitle}>Volunteers</Text>
            <Text style={s.whoDesc}>
              Anyone who gives time, money or kindness — and wants to see what it adds up to.
            </Text>
          </View>
          <View style={s.whoCard}>
            <Text style={s.whoTitle}>Schools &amp; Universities</Text>
            <Text style={s.whoDesc}>
              Track student volunteering, evidence outcomes and showcase community contribution.
            </Text>
          </View>
          <View style={s.whoCard}>
            <Text style={s.whoTitle}>Employers</Text>
            <Text style={s.whoDesc}>
              Quantify your team’s social value, run match programmes and report it credibly.
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <View>
            <Text style={s.footerLabel}>Get in touch</Text>
            <Text style={s.footerValue}>
              <Text style={s.footerOrange}>hello@myimpact.uk</Text>  ·  myimpact.uk
            </Text>
          </View>
          <View style={s.ctaPill}>
            <Text style={s.ctaText}>Calculate my impact →</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

async function main() {
  await renderToFile(<OnePager />, OUT);
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
