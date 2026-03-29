import { forwardRef } from "react";
import { Badge } from "@/lib/badges";
import { formatCurrency } from "@/lib/utils";

interface MilestoneShareCardProps {
  badge: Badge;
  totalValue: number;
  format: "landscape" | "portrait";
  appUrl?: string;
}

const CARD_SIZES = {
  landscape: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1080 },
};

const MilestoneShareCard = forwardRef<HTMLDivElement, MilestoneShareCardProps>(
  ({ badge, totalValue, format, appUrl }, ref) => {
    const { width, height } = CARD_SIZES[format];
    const displayUrl = appUrl ?? (typeof window !== "undefined" ? window.location.hostname : "myimpact.com");

    return (
      <div
        ref={ref}
        style={{
          width,
          height,
          backgroundColor: "#f5f0e8",
          color: "#1a2e3a",
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: format === "landscape" ? "56px 72px" : "80px 80px",
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
          borderRadius: format === "landscape" ? 24 : 24,
        }}
      >
        {/* Decorative accent circle */}
        <div
          style={{
            position: "absolute",
            top: format === "landscape" ? -120 : -150,
            right: format === "landscape" ? -120 : -150,
            width: format === "landscape" ? 400 : 500,
            height: format === "landscape" ? 400 : 500,
            borderRadius: "50%",
            backgroundColor: "#e8622a",
            opacity: 0.08,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: format === "landscape" ? -80 : -100,
            left: format === "landscape" ? -80 : -100,
            width: format === "landscape" ? 300 : 400,
            height: format === "landscape" ? 300 : 400,
            borderRadius: "50%",
            backgroundColor: "#e8622a",
            opacity: 0.06,
          }}
        />

        {/* Header: Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: format === "landscape" ? 44 : 52,
              height: format === "landscape" ? 44 : 52,
              borderRadius: 10,
              backgroundColor: "#e8622a",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: format === "landscape" ? 20 : 24,
                letterSpacing: -0.5,
                lineHeight: 1,
                textAlign: "center",
              }}
            >
              MI
            </span>
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: format === "landscape" ? 20 : 24,
              color: "#1a2e3a",
              letterSpacing: -0.3,
              lineHeight: 1,
            }}
          >
            My Impact
          </span>
        </div>

        {/* Centre: Milestone */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: format === "landscape" ? 20 : 28,
            paddingTop: format === "landscape" ? 24 : 32,
            paddingBottom: format === "landscape" ? 24 : 32,
          }}
        >
          {/* Milestone emoji in circle */}
          <div
            style={{
              width: format === "landscape" ? 140 : 180,
              height: format === "landscape" ? 140 : 180,
              borderRadius: "50%",
              backgroundColor: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 32px rgba(26,46,58,0.12)",
              border: `4px solid ${badge.colour}`,
            }}
          >
            <span style={{ fontSize: format === "landscape" ? 64 : 80 }}>
              {badge.emoji}
            </span>
          </div>

          {/* Milestone name */}
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontSize: format === "landscape" ? 44 : 52,
                fontWeight: 800,
                color: "#1a2e3a",
                margin: 0,
                lineHeight: 1.1,
                letterSpacing: -1,
              }}
            >
              {badge.name}
            </p>
            <p
              style={{
                fontSize: format === "landscape" ? 20 : 24,
                color: "#4a6070",
                margin: "12px 0 0",
                lineHeight: 1.4,
                maxWidth: format === "landscape" ? 700 : 800,
                textAlign: "center",
              }}
            >
              {badge.description}
            </p>
          </div>

          {/* Score highlight */}
          <div
            style={{
              backgroundColor: "#e8622a",
              borderRadius: 16,
              padding: format === "landscape" ? "16px 40px" : "20px 48px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <p
              style={{
                fontSize: format === "landscape" ? 36 : 44,
                fontWeight: 800,
                color: "#ffffff",
                margin: 0,
                letterSpacing: -0.5,
              }}
            >
              {formatCurrency(totalValue)}
            </p>
            <p
              style={{
                fontSize: format === "landscape" ? 14 : 17,
                color: "rgba(255,255,255,0.85)",
                margin: 0,
                fontWeight: 500,
              }}
            >
              of social value created
            </p>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            flexDirection: format === "landscape" ? "row" : "column",
            alignItems: format === "landscape" ? "flex-end" : "flex-start",
            justifyContent: "space-between",
            gap: format === "portrait" ? 8 : 0,
          }}
        >
          <p
            style={{
              fontSize: format === "landscape" ? 13 : 16,
              color: "#7a9aaa",
              margin: 0,
              maxWidth: format === "landscape" ? 460 : "100%",
              lineHeight: 1.4,
              fontStyle: "italic",
            }}
          >
            Calculated using globally recognised social value standards
          </p>
          <p
            style={{
              fontSize: format === "landscape" ? 15 : 18,
              fontWeight: 700,
              color: "#e8622a",
              margin: 0,
              letterSpacing: 0.2,
            }}
          >
            {displayUrl}
          </p>
        </div>
      </div>
    );
  }
);

MilestoneShareCard.displayName = "MilestoneShareCard";

export default MilestoneShareCard;
export { CARD_SIZES };
