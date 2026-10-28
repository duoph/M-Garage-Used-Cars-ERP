import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./empty-state";

export function AccessDenied() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You don't have access to this page"
      description="Your role doesn't include permission for this area. Ask an Admin / Owner if you need access."
      action={
        <Button asChild variant="outline">
          <Link href="/">Back to dashboard</Link>
        </Button>
      }
      className="py-24"
    />
  );
}
