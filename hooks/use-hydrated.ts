"use client";
import * as React from "react";

const subscribe = () => () => {};

/** True on the client after hydration; false during SSR. Avoids setState-in-effect patterns. */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(subscribe, () => true, () => false);
}
