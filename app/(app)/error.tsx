"use client";
import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-warning-soft text-warning">
        <TriangleAlert className="size-5" />
      </span>
      <h1 className="text-base font-semibold">This page ran into a problem</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Your data is safe — nothing was half-saved. Try again, or go back to the dashboard.
      </p>
      <div className="mt-4 flex gap-2">
        <Button onClick={reset}><RotateCcw /> Try again</Button>
        <Button variant="outline" asChild><Link href="/">Dashboard</Link></Button>
      </div>
    </div>
  );
}
