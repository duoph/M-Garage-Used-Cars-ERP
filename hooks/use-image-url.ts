"use client";
import * as React from "react";
import { indexedDbImageStorage } from "@/lib/images/storage";
import { isR2Key, r2ImageUrl } from "@/lib/images/r2-keys";

/**
 * Ref-counted object-URL cache. Each blob key gets one object URL shared by all consumers,
 * revoked when the last consumer unmounts, so grids and galleries don't leak memory.
 * R2 keys skip the blob step and resolve straight to their `/api/images/...` URL.
 */
interface Entry {
  url: string | null;
  refs: number;
  promise: Promise<string | null>;
  revokeTimer?: ReturnType<typeof setTimeout>;
}
const cache = new Map<string, Entry>();

function acquire(key: string): Entry {
  let entry = cache.get(key);
  if (!entry && isR2Key(key)) {
    const url = r2ImageUrl(key);
    entry = { url, refs: 0, promise: Promise.resolve(url) };
    cache.set(key, entry);
  }
  if (!entry) {
    const e: Entry = {
      url: null,
      refs: 0,
      promise: indexedDbImageStorage.get(key).then((blob) => {
        e.url = blob ? URL.createObjectURL(blob) : null;
        return e.url;
      }),
    };
    entry = e;
    cache.set(key, e);
  }
  if (entry.revokeTimer) {
    clearTimeout(entry.revokeTimer);
    entry.revokeTimer = undefined;
  }
  entry.refs++;
  return entry;
}

function release(key: string) {
  const entry = cache.get(key);
  if (!entry) return;
  entry.refs--;
  if (entry.refs <= 0) {
    // Small grace period avoids churn when navigating between views that show the same photo.
    entry.revokeTimer = setTimeout(() => {
      if (entry.refs > 0) return;
      if (entry.url?.startsWith("blob:")) URL.revokeObjectURL(entry.url);
      cache.delete(key);
    }, 30_000);
  }
}

export type ImageUrlState = { status: "loading" | "ready" | "missing"; url: string | null };

export function useImageUrl(key: string | null | undefined): ImageUrlState {
  // Resolved URLs are tagged with their key so a stale result is never shown for a new key.
  const [resolved, setResolved] = React.useState<{ key: string; url: string | null } | null>(null);

  React.useEffect(() => {
    if (!key) return;
    let active = true;
    const entry = acquire(key);
    entry.promise
      .then((url) => active && setResolved({ key, url }))
      .catch(() => active && setResolved({ key, url: null }));
    return () => {
      active = false;
      release(key);
    };
  }, [key]);

  if (!key) return { status: "missing", url: null };
  const cached = cache.get(key)?.url;
  if (cached) return { status: "ready", url: cached };
  if (resolved?.key === key) return resolved.url ? { status: "ready", url: resolved.url } : { status: "missing", url: null };
  return { status: "loading", url: null };
}
