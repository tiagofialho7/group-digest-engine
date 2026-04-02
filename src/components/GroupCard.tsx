import { Link } from "react-router-dom";
import { MessageSquare, AlertCircle, ChevronRight, Users, WifiOff } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { WhatsAppGroup } from "@/lib/mock-data";

interface GroupCardProps {
  group: WhatsAppGroup;
  style?: React.CSSProperties;
  pictureUrl?: string | null;
}

export default function GroupCard({ group, style, pictureUrl }: GroupCardProps) {
  return (
    <Link
      to={`/group/${group.id}`}
      className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-muted/50 transition-colors group"
      style={style}
    >
      {/* Avatar */}
      <Avatar className="h-10 w-10 shrink-0">
        {pictureUrl && <AvatarImage src={pictureUrl} alt={group.name} />}
        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
          {group.name.charAt(0)}
        </AvatarFallback>
      </Avatar>

      {/* Name + participants */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors text-sm">
            {group.name}
          </h3>
          {!group.isUserMember && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-destructive/10 text-destructive border border-destructive/20">
              <WifiOff className="h-2.5 w-2.5" /> Não conectado
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
          <Users className="h-3 w-3" />
          {group.participantCount} participantes
        </p>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 shrink-0">
        {group.newMessages > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-foreground">{group.newMessages}</span>
          </span>
        )}
        {group.pendingQuestions > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 text-accent" />
            <span className="font-medium text-foreground">{group.pendingQuestions}</span>
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
      </div>
    </Link>
  );
}
