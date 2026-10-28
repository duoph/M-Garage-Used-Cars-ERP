"use client";
import * as React from "react";
import { toast } from "sonner";
import { BusinessError } from "@/lib/repositories/contracts";

/**
 * Wraps an async command with pending state and consistent error toasts.
 * Business-rule errors show their message; unexpected errors show a generic one.
 */
export function useAsyncAction() {
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setPending(true);
    try {
      const result = await fn();
      if (success) toast.success(success);
      return result;
    } catch (e) {
      reportError(e);
      return undefined;
    } finally {
      setPending(false);
    }
  }, []);
  return { pending, run };
}

export function reportError(e: unknown) {
  if (e instanceof BusinessError) toast.error(e.message);
  else {
    console.error(e);
    toast.error("Something went wrong. Your changes were not saved.");
  }
}
