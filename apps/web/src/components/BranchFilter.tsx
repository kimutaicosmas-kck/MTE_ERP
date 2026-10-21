import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { MteSelect, mapSelectOptions } from "./MteSelect";

export function BranchFilter({ value, onChange, className = "" }: { value: string; onChange: (v: string) => void; className?: string }) {
  const { data } = useQuery({
    queryKey: ["branches"],
    queryFn: () => api<{ id: string; name: string; code: string }[]>("/api/settings/branches"),
  });
  const branches = data || [];
  if (branches.length <= 1) return null;
  return (
    <MteSelect
      className={className || "w-auto min-w-[10rem]"}
      aria-label="Branch"
      value={value}
      onChange={onChange}
      placeholder="All branches"
      options={mapSelectOptions(branches, (b) => b.id, (b) => b.name, (b) => b.code)}
    />
  );
}
