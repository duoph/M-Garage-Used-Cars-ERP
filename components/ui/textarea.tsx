import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { inputClass } from "./input";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(inputClass, "min-h-20 h-auto py-2 resize-y", className)} {...props} />;
}
