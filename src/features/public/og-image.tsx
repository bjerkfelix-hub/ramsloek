import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getDictionary, SITE_NAME, type Locale } from "@/content";

export const OG_SIZE = { width: 1200, height: 630 };

const FOREST = "#2f5d3a";
const CREAM = "#fffdf5";
const SAGE = "#e6ecdf";

// Fraunces SemiBold (OFL, see src/assets/fonts) is checked in so the image renders without network access.
let fontData: Promise<Buffer> | undefined;
function displayFont() {
  fontData ??= readFile(
    join(process.cwd(), "src/assets/fonts/Fraunces-SemiBold.ttf"),
  );
  return fontData;
}

export function ogAlt(locale: Locale): string {
  return `${SITE_NAME} – ${getDictionary(locale).site.tagline}`;
}

/** Share image: forest-green background, wordmark, tagline and a simple ramsløk leaf pair. */
export async function renderOgImage(locale: Locale) {
  const tagline = getDictionary(locale).site.tagline;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 90px",
          background: FOREST,
          color: CREAM,
          fontFamily: "Fraunces",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 700 }}>
          <div style={{ fontSize: 96, lineHeight: 1.05 }}>{SITE_NAME}</div>
          <div style={{ fontSize: 40, marginTop: 28, color: SAGE }}>
            {tagline}
          </div>
        </div>
        <svg width="260" height="370" viewBox="0 0 120 170">
          <path
            d="M40 164 C 22 128, 16 84, 30 38 C 46 80, 50 126, 40 164 Z"
            fill={SAGE}
          />
          <path
            d="M86 164 C 106 132, 112 96, 102 58 C 84 92, 80 130, 86 164 Z"
            fill={SAGE}
          />
          <path
            d="M62 166 C 60 120, 61 80, 60 46"
            stroke={CREAM}
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="60" cy="40" r="16" fill={CREAM} />
          <circle cx="40" cy="52" r="9" fill={CREAM} />
          <circle cx="80" cy="52" r="9" fill={CREAM} />
        </svg>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        {
          name: "Fraunces",
          data: await displayFont(),
          weight: 600,
          style: "normal",
        },
      ],
    },
  );
}
