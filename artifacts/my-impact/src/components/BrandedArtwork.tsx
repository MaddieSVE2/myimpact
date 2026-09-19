import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { brandedArtworkUrl, type ArtworkSize } from "@/lib/branded-artwork";

interface BrandedArtworkProps {
  file?: string;
  fallback: ReactNode;
  className?: string;
  imageClassName?: string;
  size?: ArtworkSize;
  loading?: "eager" | "lazy";
}

export function BrandedArtwork({
  file,
  fallback,
  className,
  imageClassName,
  size = "web",
  loading = "lazy",
}: BrandedArtworkProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [file, size]);

  if (!file || failed) {
    return (
      <span className={className} aria-hidden="true">
        {fallback}
      </span>
    );
  }

  return (
    <span className={className} aria-hidden="true">
      <img
        src={brandedArtworkUrl(file, size)}
        alt=""
        loading={loading}
        decoding="async"
        className={imageClassName}
        onError={() => setFailed(true)}
      />
    </span>
  );
}