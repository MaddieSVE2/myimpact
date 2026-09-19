import { Link } from "wouter";

const offBlack = "var(--brand-off-black)";

// Sister products in the Social Value Engine family, shown in the footer.
const SVE_FAMILY_LINKS = [
  { label: "Social Value Engine", href: "https://www.socialvalueengine.com" },
  { label: "Rose Regeneration", href: "https://roseregeneration.co.uk" },
  { label: "Impact Card Studio", href: "https://impactcardstudio.com" },
  { label: "Place Explorer", href: "https://place.socialvalueengine.com" },
  { label: "Social Value Direct", href: "https://direct.socialvalueengine.com" },
  { label: "HearAbouts", href: "https://hearabouts.org" },
  { label: "My Impact", href: "https://myimpact.uk" },
];

const EXPLORE_LINKS = [
  { label: "About", href: "/about" },
  { label: "Methodology", href: "/methodology" },
  { label: "What's New", href: "/whats-new" },
  { label: "Contact", href: "/contact" },
];

const ORG_LINKS = [
  { label: "Register your organisation", href: "/org/register" },
  { label: "Organisation dashboard", href: "/login?next=%2Forg" },
];

const LEGAL_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Security", href: "/security" },
];

const headingStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,0.60)",
  marginBottom: 14,
};

const linkStyle: React.CSSProperties = {
  fontSize: 13,
  color: "rgba(255,255,255,0.7)",
  textDecoration: "none",
  lineHeight: 1.4,
};

export function Footer() {
  return (
    <footer className="mi-footer" style={{ background: offBlack, padding: "48px 5% 28px" }}>
      <div
        style={{
          maxWidth: 1080,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 32,
          textAlign: "left",
        }}
      >
        {/* Brand */}
        <div style={{ minWidth: 200 }}>
          <img
            src={`${import.meta.env.BASE_URL}images/myimpact.png`}
            alt="My Impact"
            style={{ height: 36, marginBottom: 12, display: "block" }}
          />
          <p className="mi-footer-tagline" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>
            The difference I make.
          </p>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", lineHeight: 1.5 }}>
            Powered by Social Value Engine methodology
          </p>
        </div>

        {/* Explore */}
        <div>
          <p style={headingStyle}>Explore</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {EXPLORE_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="mi-footer-link" style={linkStyle}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Organisations */}
        <div>
          <p style={headingStyle}>Organisations</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {ORG_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="mi-footer-link" style={linkStyle}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        {/* SVE family */}
        <div>
          <p style={{ ...headingStyle, color: "var(--brand-orange-bright, #F06127)" }}>Part of the SVE family</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {SVE_FAMILY_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mi-footer-link"
                  style={linkStyle}
                  data-testid={`link-sve-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          maxWidth: 1080,
          margin: "32px auto 0",
          paddingTop: 20,
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <p className="mi-footer-credit" style={{ fontSize: 12, color: "rgba(255,255,255,0.60)", margin: 0 }}>
          © {new Date().getFullYear()} My Impact
        </p>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="mi-footer-link" style={{ ...linkStyle, fontSize: 12 }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
