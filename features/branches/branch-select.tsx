"use client";
import { useData } from "@/components/providers/data-provider";
import { useAuth } from "@/hooks/use-auth";
import { liveBranches } from "@/lib/calculations/branches";
import { branchScope } from "@/lib/permissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Branches the signed-in person may work in (all of them for owners and managers). */
export function useMyBranches() {
  const { ds } = useData();
  const { user } = useAuth();
  const scope = branchScope(user);
  return liveBranches(ds.branches).filter((b) => !scope || scope.includes(b.id));
}

/** Picks a branch. With `allowAll`, "All branches" (value "all") is offered to people who see every branch. */
export function BranchSelect({
  id,
  value,
  onChange,
  allowAll = false,
  className,
}: {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const branches = useMyBranches();
  const everyBranch = !branchScope(user);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={className} aria-label="Branch">
        <SelectValue placeholder="Select branch" />
      </SelectTrigger>
      <SelectContent>
        {allowAll && everyBranch && <SelectItem value="all">All branches</SelectItem>}
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
