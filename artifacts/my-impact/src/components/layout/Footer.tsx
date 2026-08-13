import { Link } from "wouter";

const offBlack = "var(--brand-off-black)";

// Sister products in the Social Value Engine family, shown in the footer.
const SVE_FAMILY_LINKS = [
  { label: "Rose Regeneration", href: "https://roseregeneration.co.uk" },
  { label: "Impact Card Studio", href: "https://impactcardstudio.com" },
  { label: "Place Explorer", href: "https://place.socialvalueengine.com" },
  { label: "My Impact", href: "https://myimpact.uk" },
  { label: "Social Value Direct", href: "https://direct.socialvalueengine.com" },
  { label: "HearAbouts", href: "https://hearabouts.org" },
  { label: "Social Value Engine", href: "https://www.socialvalueengine.com" },
];

export function Footer() {
  return (
    <footer className="mi-footer" style={{ background: offBlack, padding: "40px 5%", textAlign: "center" }}>
      <img
        src={`${import.meta.env.BASE_URL}images/myimpact.png`}
        alt="My Impact"
        style={{ height: 40, marginBottom: 16, display: "inline-block" }}
      />
      <p className="mi-footer-tagline" style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 20 }}>The difference I make.</p>
      <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" as const, marginBottom: 20 }}>
        <Link href="/about" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>About</Link>
        <Link href="/methodology" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Methodology</Link>
        <Link href="/whats-new" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>What's New</Link>
        <Link href="/privacy" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Privacy</Link>
        <Link href="/terms" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Terms</Link>
        <Link href="/security" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Security</Link>
        <Link href="/contact" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Contact</Link>
        <Link href="/org/register" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Register your organisation</Link>
        <Link href="/login?next=%2Forg" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Organisation dashboard</Link>
      </div>
      <div style={{ marginBottom: 20 }}>
        <p className="mi-footer-tagline" style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 10 }}>Part of the SVE family</p>
        <div style={{ display: "flex", justifyContent: "center", gap: 24, flexWrap: "wrap" as const }}>
          {SVE_FAMILY_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mi-footer-link"
              style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}
              data-testid={`link-sve-${l.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
      <p className="mi-footer-credit" style={{ fontSize: 12, color: "rgba(255,255,255,0.65)" }}>
        Powered by Social Value Engine methodology · Secure cloud hosting
      </p>
    </footer>
  );
}
