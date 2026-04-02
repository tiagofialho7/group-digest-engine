import { Badge } from "@/components/ui/badge";

interface SenderNameProps {
  name: string;
  className?: string;
}

/**
 * Renders a sender name. If it contains "[GroupLens]", strips the tag
 * and renders a styled badge next to the clean name.
 */
export function SenderName({ name, className = "" }: SenderNameProps) {
  const isGroupLens = name.includes("[GroupLens]");
  const cleanName = isGroupLens ? name.replace(/\s*\[GroupLens\]\s*/, "").trim() : name;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="truncate">{cleanName}</span>
      {isGroupLens && (
        <Badge
          variant="outline"
          className="text-[7px] leading-none px-1.5 py-0.5 rounded-sm font-semibold border-emerald-500/40 bg-emerald-500/10 text-emerald-400 shrink-0"
        >
          GroupLens
        </Badge>
      )}
    </span>
  );
}
