import { useState } from "react";
import { ChevronDown, ChevronUp, MessageSquareText, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import ImageViewer from "@/components/ImageViewer";
import { SenderName } from "@/components/SenderName";
import { formatWhatsAppText } from "@/lib/whatsapp-format";

interface ContextBlockProps {
  block: {
    id: string;
    title: string;
    summary: string;
    messageCount: number;
    isAnswered: boolean;
    answeredBy?: string;
    answerSummary?: string;
    messages: any[];
    timestamp: string;
  };
  groupId: string;
  messageIds?: string[];
}

interface MessageData {
  id: string;
  sender_name: string;
  content: string;
  sent_at: string;
  whatsapp_message_id: string | null;
  reply_to_whatsapp_id: string | null;
  quoted_content: string | null;
  quoted_sender: string | null;
  image_url: string | null;
}

interface MessageNode extends MessageData {
  children: MessageNode[];
}

function buildMessageTree(messages: MessageData[]): MessageNode[] {
  const byWhatsappId = new Map<string, MessageNode>();
  const roots: MessageNode[] = [];
  const nodes: MessageNode[] = messages.map((m) => ({ ...m, children: [] }));
  for (const node of nodes) {
    if (node.whatsapp_message_id) byWhatsappId.set(node.whatsapp_message_id, node);
  }
  for (const node of nodes) {
    if (node.reply_to_whatsapp_id && byWhatsappId.has(node.reply_to_whatsapp_id)) {
      byWhatsappId.get(node.reply_to_whatsapp_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

const THREAD_COLORS = [
  "border-primary/40",
  "border-accent/40",
  "border-green-500/40",
  "border-orange-400/40",
  "border-pink-400/40",
];

const MAX_INDENT_DEPTH = 3;

function ThreadMessage({ node, depth = 0, avatarMap }: { node: MessageNode; depth?: number; avatarMap: Map<string, string | null> }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const visualDepth = Math.min(depth, MAX_INDENT_DEPTH);
  const colorClass = THREAD_COLORS[visualDepth % THREAD_COLORS.length];
  const avatarUrl = avatarMap.get(node.sender_name);
  const initials = node.sender_name?.slice(0, 2).toUpperCase() || "?";

  return (
    <div className="min-w-0">
      <div className={cn("flex min-w-0", visualDepth > 0 && "ml-3")}>
        {visualDepth > 0 && (
          <div className="relative flex-shrink-0 w-3 mr-1">
            <div className={cn("absolute left-0 top-0 bottom-0 w-0 border-l-2", colorClass)} />
            <div className={cn("absolute left-0 top-4 w-full h-0 border-t-2", colorClass)} />
          </div>
        )}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="p-3 rounded-lg bg-muted/60 hover:bg-muted/80 transition-colors">
            <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
              <Avatar className="h-5 w-5 shrink-0">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={node.sender_name} />}
                <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{initials}</AvatarFallback>
              </Avatar>
              <SenderName name={node.sender_name} className="text-[11px] font-medium text-primary" />
              <span className="text-[10px] text-muted-foreground shrink-0">
                {new Date(node.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              {depth > 0 && node.quoted_sender && (
                <span className="text-[10px] text-muted-foreground/60 truncate hidden sm:inline">
                  → {node.quoted_sender.replace(/@.*/, '')}
                </span>
              )}
            </div>
            {node.content && <p className="text-xs text-foreground leading-relaxed break-words">{formatWhatsAppText(node.content)}</p>}
            {node.image_url && (
              <>
                <img
                  src={node.image_url}
                  alt="Imagem"
                  className="mt-1.5 rounded-md max-w-full max-h-[120px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setViewerOpen(true); }}
                />
                <ImageViewer src={node.image_url} open={viewerOpen} onOpenChange={setViewerOpen} />
              </>
            )}
          </div>
          {node.children.length > 0 && (
            <div className="mt-0.5 space-y-0.5">
              {node.children.map((child) => (
                <ThreadMessage key={child.id} node={child} depth={depth + 1} avatarMap={avatarMap} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ContextBlockCard({ block, groupId, messageIds }: ContextBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [avatarMap, setAvatarMap] = useState<Map<string, string | null>>(new Map());

  const loadAvatars = async (msgs: MessageData[]) => {
    const { data: msgPhones } = await supabase
      .from("messages")
      .select("sender_name, sender_phone")
      .in("id", msgs.map(m => m.id))
      .not("sender_phone", "is", null);

    if (!msgPhones?.length) return;

    // Map phone → all sender_names that use it
    const phoneToNames = new Map<string, Set<string>>();
    for (const m of msgPhones) {
      if (m.sender_phone) {
        if (!phoneToNames.has(m.sender_phone)) phoneToNames.set(m.sender_phone, new Set());
        phoneToNames.get(m.sender_phone)!.add(m.sender_name);
      }
    }

    const uniquePhones = [...phoneToNames.keys()];
    if (uniquePhones.length === 0) return;

    const { data: profiles } = await supabase
      .from("contact_profiles")
      .select("phone_number, avatar_url")
      .in("phone_number", uniquePhones);

    if (profiles) {
      const map = new Map<string, string | null>();
      for (const p of profiles) {
        const names = phoneToNames.get(p.phone_number);
        if (names) {
          for (const name of names) {
            map.set(name, p.avatar_url);
          }
        }
      }
      setAvatarMap(map);
    }
  };

  const loadMessages = async () => {
    if (messages.length > 0 || !messageIds?.length) return;
    setLoadingMessages(true);
    const { data } = await supabase
      .from("messages")
      .select("id, sender_name, content, sent_at, whatsapp_message_id, reply_to_whatsapp_id, quoted_content, quoted_sender, image_url")
      .in("id", messageIds)
      .order("sent_at", { ascending: true });
    if (data) {
      setMessages(data);
      loadAvatars(data);
    }
    setLoadingMessages(false);
  };

  const handleToggle = () => {
    if (!expanded) loadMessages();
    setExpanded(!expanded);
  };

  const tree = buildMessageTree(messages);

  return (
    <div className="rounded-xl bg-card border border-border/50 overflow-hidden transition-all duration-200 hover:shadow-md hover:border-border">
      <button
        className="w-full text-left px-5 py-4 hover:bg-muted/20 transition-all duration-200"
        onClick={handleToggle}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {block.isAnswered ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
              ) : (
                <Clock className="h-3.5 w-3.5 text-accent shrink-0" />
              )}
              <h3 className="text-[15px] font-semibold text-foreground truncate">{block.title}</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 ml-5 mt-2">{block.summary}</p>
            {block.isAnswered && block.answeredBy && (
              <div className="mt-3 ml-5 px-3 py-2 rounded-lg bg-success/10 border border-success/20">
                <p className="text-[10px] text-success font-medium">{block.answeredBy}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{block.answerSummary}</p>
              </div>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-1 mt-0.5">
            <Link
              to={`/chat/${groupId}/${block.id}`}
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 rounded-md text-primary hover:bg-primary/10 transition-colors"
              title="Chat com contexto"
            >
              <MessageSquareText className="h-4 w-4" />
            </Link>
            <span className="text-muted-foreground/50">
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div>
          <div className="p-5 space-y-2 overflow-x-hidden bg-muted/20">
            {loadingMessages && <p className="text-xs text-muted-foreground">Carregando mensagens...</p>}
            {tree.map((node) => (
              <ThreadMessage key={node.id} node={node} depth={0} avatarMap={avatarMap} />
            ))}
            {!loadingMessages && messages.length === 0 && messageIds && messageIds.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma mensagem original disponível.</p>
            )}
          </div>
          <div className="px-5 pb-4">
            <Link to={`/chat/${groupId}/${block.id}`}>
              <Button variant="ghost" size="sm" className="w-full gap-2 text-sm h-10 text-primary hover:bg-primary/10">
                <MessageSquareText className="h-3.5 w-3.5" /> Chat com contexto
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
