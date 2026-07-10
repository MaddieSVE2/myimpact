import { Helmet } from "react-helmet-async";

const SITE_ORIGIN = "https://myimpact.uk";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/opengraph.jpg`;

interface PageMetaProps {
  title: string;
  description: string;
  canonical?: string;
  noIndex?: boolean;
  ogImage?: string;
  ogType?: string;
  jsonLd?: object | object[];
}

export function PageMeta({
  title,
  description,
  canonical,
  noIndex = false,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  jsonLd,
}: PageMetaProps) {
  const robotsContent = noIndex ? "noindex, nofollow" : "index, follow";
  const fullTitle = title.includes("My Impact") ? title : `${title} | My Impact`;

  const jsonLdArray = jsonLd
    ? Array.isArray(jsonLd)
      ? jsonLd
      : [jsonLd]
    : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <meta name="robots" content={robotsContent} />
      {canonical && <link rel="canonical" href={canonical} />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={ogType} />
      {canonical && <meta property="og:url" content={canonical} />}
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="My Impact" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {/* JSON-LD */}
      {jsonLdArray.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}

export function NoIndexMeta() {
  return (
    <Helmet>
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  );
}
