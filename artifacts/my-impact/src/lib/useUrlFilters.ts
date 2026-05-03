import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";

export interface UrlFilters {
  q: string;
  tags: string[];
}

function readFromSearch(): UrlFilters {
  if (typeof window === "undefined") return { q: "", tags: [] };
  const params = new URLSearchParams(window.location.search);
  const tagsParam = params.get("tags") ?? "";
  const tags = tagsParam
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return { q: params.get("q") ?? "", tags };
}

export function useUrlFilters(): {
  filters: UrlFilters;
  setSearch: (q: string) => void;
  toggleTag: (tag: string) => void;
  clearAll: () => void;
} {
  const [location, navigate] = useLocation();
  const [filters, setFilters] = useState<UrlFilters>(() => readFromSearch());

  // Sync from URL when location changes (e.g. user clicks back).
  useEffect(() => {
    setFilters(readFromSearch());
  }, [location]);

  const writeUrl = useCallback(
    (next: UrlFilters) => {
      const params = new URLSearchParams(window.location.search);
      if (next.q) params.set("q", next.q);
      else params.delete("q");
      if (next.tags.length > 0) params.set("tags", next.tags.join(","));
      else params.delete("tags");
      const search = params.toString();
      const target = search ? `${location}?${search}` : location;
      navigate(target, { replace: true });
      setFilters(next);
    },
    [location, navigate],
  );

  const setSearch = useCallback(
    (q: string) => {
      writeUrl({ q, tags: filters.tags });
    },
    [filters.tags, writeUrl],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      const exists = filters.tags.includes(tag);
      const tags = exists ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag];
      writeUrl({ q: filters.q, tags });
    },
    [filters.q, filters.tags, writeUrl],
  );

  const clearAll = useCallback(() => {
    writeUrl({ q: "", tags: [] });
  }, [writeUrl]);

  return { filters, setSearch, toggleTag, clearAll };
}
