import { forwardRef } from "react";
import { formatCurrency, formatNumber } from "@/lib/utils";

export interface RecapShareCardData {
  year: number;
  totalValue: number;
  totalHours: number;
  topActivityName: string | null;
  topSdg: string | null;
  topSdgColor: string | null;
  recordCount: number;
  showMoney: boolean;
  displayName: string | null;
}

interface RecapShareCardProps {
  data: RecapShareCardData;
  format: "landscape" | "portrait";
  appUrl?: string;
  logoDataUrl?: string;
}

const CARD_SIZES = {
  landscape: { width: 1200, height: 630 },
  portrait: { width: 1080, height: 1080 },
};

const RecapShareCard = forwardRef<HTMLDivElement, RecapShareCardProps>(
  ({ data, format, appUrl, logoDataUrl }, ref) => {
    const { width, height } = CARD_SIZES[format];
    const padding = format === "landscape" ? 56 : 80;
    const paddingH = format === "landscape" ? 72 : 80;
    const displayUrl = appUrl ?? (typeof window !== "undefined" ? window.location.hostname : "myimpact.com");
    const logoSrc = logoDataUrl ?? "/images/myimpact.png";

    const sdgColor = data.topSdgColor ?? "#e8622a";
    const yearLabel = String(data.year);

    return (
      <div
        ref={ref}
        style={{
          width,
          height,
          backgroundColor: "#1a2e3a",
          color: "#ffffff",
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          display: "flex",
          flexDirection: "column",
          padding: `${padding}px ${paddingH}px`,
          boxSizing: "border-box",
          position: "relative",
          overflow: "hidden",
          borderRadius: 24,
        }}
      >
        {/* Decorative gradient blobs */}
        <div
          style={{
            position: "absolute",
            top: format === "landscape" ? -160 : -200,
            right: format === "landscape" ? -160 : -200,
            width: format === "landscape" ? 520 : 640,
            height: format === "landscape" ? 520 : 640,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${sdgColor} 0%, transparent 65%)`,
            opacity: 0.45,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: format === "landscape" ? -120 : -160,
            left: format === "landscape" ? -120 : -160,
            width: format === "landscape" ? 420 : 520,
            height: format === "landscape" ? 420 : 520,
            borderRadius: "50%",
            background: "radial-gradient(circle, #e8622a 0%, transparent 65%)",
            opacity: 0.32,
          }}
        />

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            style={{
              backgroundColor: "rgba(255,255,255,0.12)",
              borderRadius: 10,
              padding: format === "landscape" ? "6px 12px" : "8px 14px",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <img
              src={logoSrc}
              alt="My Impact"
              style={{
                height: format === "landscape" ? 32 : 40,
                width: "auto",
                display: "block",
              }}
            />
          </div>
          <p
            style={{
              fontSize: format === "landscape" ? 13 : 16,
              color: "rgba(255,255,255,0.6)",
              margin: 0,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Year in Impact
          </p>
        </div>

        {/* Main content */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            position: "relative",
            zIndex: 2,
          }}
        >
          <p
            style={{
              fontSize: format === "landscape" ? 18 : 22,
              color: "rgba(255,255,255,0.65)",
              margin: 0,
              fontWeight: 600,
              letterSpacing: 1,
            }}
          >
            {data.displayName ? `${data.displayName}'s` : "My"} {yearLabel} recap
          </p>
          {data.showMoney ? (
            <p
              style={{
                fontSize: format === "landscape" ? 96 : 132,
                fontWeight: 900,
                color: "#ffffff",
                margin: "8px 0 0",
                lineHeight: 1.0,
                letterSpacing: -3,
                fontFamily: "'Outfit', 'Inter', sans-serif",
              }}
            >
              {formatCurrency(data.totalValue)}
            </p>
          ) : (
            <p
              style={{
                fontSize: format === "landscape" ? 96 : 132,
                fontWeight: 900,
                color: "#ffffff",
                margin: "8px 0 0",
                lineHeight: 1.0,
                letterSpacing: -3,
                fontFamily: "'Outfit', 'Inter', sans-serif",
              }}
            >
              {formatNumber(data.totalHours)}
              <span style={{ fontSize: format === "landscape" ? 36 : 48, fontWeight: 700, marginLeft: 12, color: "rgba(255,255,255,0.6)" }}>hrs</span>
            </p>
          )}
          <p
            style={{
              fontSize: format === "landscape" ? 18 : 22,
              color: "rgba(255,255,255,0.7)",
              margin: "8px 0 0",
              fontWeight: 500,
            }}
          >
            {data.showMoney
              ? `of social value created across ${formatNumber(data.totalHours)} hours`
              : `given to making a difference this year`}
          </p>

          {/* Highlights row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: format === "landscape" ? "1fr 1fr" : "1fr",
              gap: format === "landscape" ? 16 : 18,
              marginTop: format === "landscape" ? 32 : 56,
            }}
          >
            {data.topActivityName ? (
              <div
                style={{
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  padding: format === "landscape" ? "16px 20px" : "20px 24px",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <p
                  style={{
                    fontSize: format === "landscape" ? 11 : 14,
                    color: "rgba(255,255,255,0.5)",
                    margin: 0,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                  }}
                >
                  Top activity
                </p>
                <p
                  style={{
                    fontSize: format === "landscape" ? 20 : 26,
                    color: "#ffffff",
                    margin: "6px 0 0",
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {data.topActivityName}
                </p>
              </div>
            ) : null}
            {data.topSdg ? (
              <div
                style={{
                  background: "rgba(255,255,255,0.08)",
                  borderRadius: 14,
                  padding: format === "landscape" ? "16px 20px" : "20px 24px",
                  border: `1px solid ${sdgColor}`,
                }}
              >
                <p
                  style={{
                    fontSize: format === "landscape" ? 11 : 14,
                    color: "rgba(255,255,255,0.5)",
                    margin: 0,
                    fontWeight: 700,
                    letterSpacing: 1.5,
                    textTransform: "uppercase",
                  }}
                >
                  Top UN goal
                </p>
                <p
                  style={{
                    fontSize: format === "landscape" ? 20 : 26,
                    color: sdgColor,
                    margin: "6px 0 0",
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {data.topSdg}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "relative",
            zIndex: 2,
          }}
        >
          <p
            style={{
              fontSize: format === "landscape" ? 13 : 16,
              color: "rgba(255,255,255,0.5)",
              margin: 0,
              fontStyle: "italic",
            }}
          >
            {data.recordCount} {data.recordCount === 1 ? "record" : "records"} · powered by Social Value Engine
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
  },
);

RecapShareCard.displayName = "RecapShareCard";

export default RecapShareCard;
export { CARD_SIZES };
