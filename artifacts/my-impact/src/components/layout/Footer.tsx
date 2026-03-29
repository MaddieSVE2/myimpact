import { Link } from "wouter";

const offBlack = "var(--brand-off-black)";

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
        <Link href="/whats-new" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>What's New</Link>
        <Link href="/privacy" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Privacy</Link>
        <Link href="/contact" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Contact</Link>
        <Link href="/org/register" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Register your organisation</Link>
        <Link href="/login?next=%2Forg" className="mi-footer-link" style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", textDecoration: "none" }}>Organisation dashboard</Link>
      </div>
      <p className="mi-footer-credit" style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
        Powered by Social Value Engine methodology · UK data centres
      </p>
    </footer>
  );
}
