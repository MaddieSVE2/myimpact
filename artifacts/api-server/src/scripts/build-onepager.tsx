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
const SCREENSHOT = path.join(ROOT, "attached_assets/onepager/screenshot_orgs.jpg");
const OUT = path.join(ROOT, "attached_assets/onepager/MyImpact_OnePager_Organisations.pdf");

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
    marginTop: 10,
    marginHorizontal: 36,
    backgroundColor: NAVY,
    borderRadius: 10,
    padding: 12,
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
    marginTop: 10,
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
    padding: 10,
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
    marginTop: 10,
    backgroundColor: NAVY,
    paddingTop: 11,
    paddingBottom: 11,
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
    <Document title="My Impact for Organisations One-Pager" author="My Impact">
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerAccent} />
          <Image src={LOGO} style={s.logoImg} />
          <Text style={s.headerTagline}>Powered by the Social Value Engine</Text>
        </View>

        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.eyebrow}>For Schools · Universities · Employers · Charities</Text>
          <Text style={s.headline}>
            Quantify the social value{"\n"}
            your people <Text style={s.headlineAccent}>actually create.</Text>
          </Text>
          <Text style={s.subhead}>
            My Impact gives your organisation a clear, pounds and pence picture of all the
            volunteering, mentoring and giving your people do. It is ready to drop straight
            into your annual report, your next funding bid, or the story you tell the world.
          </Text>
        </View>

        {/* Body */}
        <View style={s.body}>
          <View style={s.leftCol}>
            <Text style={s.sectionTitle}>How it works for your organisation</Text>
            <Feature
              num="1"
              title="Invite your people"
              desc="Send a sign up link with your logo on it to your staff, students or volunteers. Joining takes less than a minute."
              variant={0}
            />
            <Feature
              num="2"
              title="They log, you see it all"
              desc="Members add their hours, donations and activities in a simple app. We do the maths and roll it up into one shared dashboard for your team."
              variant={1}
            />
            <Feature
              num="3"
              title="Approve, match, celebrate"
              desc="Tick off member hours, match what your team gives, run friendly challenges, and shine a light on the people doing the most."
              variant={2}
            />
            <Feature
              num="4"
              title="Share the story"
              desc="Export beautiful PDF reports, a public impact page and a spreadsheet of the numbers. Hand them to funders, your board, or anyone who asks."
              variant={3}
            />
          </View>
          <View style={s.rightCol}>
            <View style={s.screenshotCard}>
              <Image src={SCREENSHOT} style={s.screenshotImg} />
            </View>
            <Text style={s.screenshotCaption}>Live organisation dashboard</Text>
          </View>
        </View>

        {/* Stats strip */}
        <View style={s.statsStrip}>
          <View style={s.stat}>
            <Text style={s.statValue}>£8+</Text>
            <Text style={s.statLabel}>of value for every £1 invested</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>17 Goals</Text>
            <Text style={s.statLabel}>linked to UN global goals</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>Verified</Text>
            <Text style={s.statLabel}>hours signed off by your team</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>Yours</Text>
            <Text style={s.statLabel}>your logo on every report</Text>
          </View>
        </View>

        {/* Who it's for */}
        <View style={s.whoStrip}>
          <View style={s.whoCard}>
            <Text style={s.whoTitle}>Schools &amp; Universities</Text>
            <Text style={s.whoDesc}>
              Show what your students give back to the community, in a way inspectors,
              parents and partners actually understand.
            </Text>
          </View>
          <View style={s.whoCard}>
            <Text style={s.whoTitle}>Employers</Text>
            <Text style={s.whoDesc}>
              Put a real number on the good your team does, and run friendly campaigns
              your people genuinely want to take part in.
            </Text>
          </View>
          <View style={s.whoCard}>
            <Text style={s.whoTitle}>Charities &amp; Councils</Text>
            <Text style={s.whoDesc}>
              Show funders and the public exactly what every pound and every hour you
              invest turns into. Plain English, real numbers.
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
            <Text style={s.ctaText}>Book a demo →</Text>
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
