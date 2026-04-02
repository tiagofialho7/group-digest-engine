import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Send, Copy, Bot, User, Loader2, ExternalLink, AlertTriangle, FileText, ChevronDown, ChevronUp, History, MessageSquare, Clock, CheckCircle2, XCircle, Globe, Search, Pin, PinOff, Image as ImageIcon, X, Layers, Menu, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";
import GroupResponseCard from "@/components/GroupResponseCard";
import { cn } from "@/lib/utils";
import { SenderName } from "@/components/SenderName";
import { formatWhatsAppText } from "@/lib/whatsapp-format";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobileMenu } from "@/components/AppLayout";

interface Msg { role: "user" | "assistant"; content: string; attachments?: MessageData[] }

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
  "border-primary/30",
  "border-accent/30",
  "border-green-500/30",
  "border-orange-400/30",
  "border-pink-400/30",
];

function SidebarThreadMessage({ node, depth = 0, referencedIds, onToggleRef, avatarMap }: { node: MessageNode; depth?: number; referencedIds: Set<string>; onToggleRef: (msg: MessageData) => void; avatarMap: Map<string, string | null> }) {
  const colorClass = THREAD_COLORS[depth % THREAD_COLORS.length];
  const isReferenced = referencedIds.has(node.id);
  const avatarUrl = avatarMap.get(node.sender_name);
  const initials = node.sender_name?.slice(0, 2).toUpperCase() || "?";

  return (
    <div className={cn("relative", depth > 0 && "ml-4 border-l-2 pl-3", depth > 0 && colorClass)}>
      <div
        className={cn(
          "py-1.5 px-2 rounded-md transition-all cursor-pointer group",
          isReferenced
            ? "bg-primary/10 ring-1 ring-primary/20"
            : "hover:bg-muted/60"
        )}
        onClick={() => onToggleRef(node)}
      >
        <div className="flex items-center gap-1.5">
          <Avatar className="h-5 w-5">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={node.sender_name} /> : null}
            <AvatarFallback className="text-[8px] bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
          <SenderName name={node.sender_name} className="text-[11px] font-medium text-foreground/80" />
          <span className="text-[10px] text-muted-foreground/60">
            {new Date(node.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {depth > 0 && node.quoted_sender && (
            <span className="text-[9px] text-muted-foreground/40">
              ↩ {node.quoted_sender.replace(/@.*/, '')}
            </span>
          )}
          <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
            {isReferenced ? (
              <PinOff className="h-3 w-3 text-primary/70" />
            ) : (
              <Pin className="h-3 w-3 text-muted-foreground/30" />
            )}
          </span>
        </div>
        <p className="text-[12px] text-foreground/70 leading-relaxed mt-0.5 line-clamp-3">{formatWhatsAppText(node.content)}</p>
        {node.image_url && (
          <img
            src={node.image_url}
            alt="Imagem"
            className="rounded mt-1.5 max-w-[160px] max-h-[100px] object-cover opacity-80 hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); window.open(node.image_url!, '_blank'); }}
          />
        )}
      </div>
      {node.children.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {node.children.map((child) => (
            <SidebarThreadMessage key={child.id} node={child} depth={depth + 1} referencedIds={referencedIds} onToggleRef={onToggleRef} avatarMap={avatarMap} />
          ))}
        </div>
      )}
    </div>
  );
}

// Context panel content (shared between desktop sidebar and mobile overlay)
function ContextPanelContent({ contextBlock, originalMessages, referencedIds, referencedList, toggleReference, avatarMap, onClose }: {
  contextBlock: any;
  originalMessages: MessageData[];
  referencedIds: Set<string>;
  referencedList: MessageData[];
  toggleReference: (msg: MessageData) => void;
  avatarMap: Map<string, string | null>;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 px-4 h-14 backdrop-blur-md bg-background/60 flex items-center justify-between">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contexto</h3>
          <div className="flex items-center gap-1.5">
            {referencedList.length > 0 && (
              <span className="text-[10px] text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
                {referencedList.length} ref
              </span>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onClose}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div className="px-4 py-3 border-b border-border/50">
          <p className="text-[13px] text-foreground/80 leading-relaxed">{contextBlock?.summary}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground/70">
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {contextBlock?.message_count}
            </span>
            {contextBlock?.is_answered ? (
              <span className="flex items-center gap-1 text-success/70">
                <CheckCircle2 className="h-3 w-3" /> Respondida
              </span>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground/50">
                <Clock className="h-3 w-3" /> Aguardando
              </span>
            )}
          </div>
          {contextBlock?.is_answered && contextBlock?.answered_by && (
            <div className="mt-2 rounded-md bg-success/5 border border-success/10 px-2.5 py-1.5">
              <p className="text-[11px] text-success/80">Por {contextBlock.answered_by}</p>
              {contextBlock?.answer_summary && (
                <p className="text-[11px] text-foreground/60 mt-0.5">{contextBlock.answer_summary}</p>
              )}
            </div>
          )}
        </div>

        <div className="px-3 py-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              Mensagens ({originalMessages.length})
            </h4>
            <p className="text-[10px] text-muted-foreground/40">Clique para referenciar</p>
          </div>
          <div className="space-y-0.5">
            {buildMessageTree(originalMessages).map((node) => (
              <SidebarThreadMessage key={node.id} node={node} depth={0} referencedIds={referencedIds} onToggleRef={toggleReference} avatarMap={avatarMap} />
            ))}
            {originalMessages.length === 0 && (
              <p className="text-xs text-muted-foreground/50 text-center py-6">Nenhuma mensagem</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const lovableModels = [
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5", label: "GPT-5" },
];

const anthropicModels = [
  { value: "anthropic/claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { value: "anthropic/claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

function buildMultimodalContent(text: string, imageUrls: string[]): string | Array<{ type: string; text?: string; image_url?: { url: string } }> {
  if (imageUrls.length === 0) return text;
  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: "text", text },
  ];
  for (const url of imageUrls) {
    parts.push({ type: "image_url", image_url: { url } });
  }
  return parts;
}

export default function ChatContext() {
  const { groupId, contextId } = useParams();
  const { user } = useAuth();
  const { org } = useOrganization();
  const isMobile = useIsMobile();
  const mobileMenu = useMobileMenu();
  const [contextBlock, setContextBlock] = useState<any>(null);
  const [groupName, setGroupName] = useState("");
  const [groupWhatsappId, setGroupWhatsappId] = useState("");
  const [input, setInput] = useState("");
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem("chat-selected-model") || lovableModels[0].value;
  });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isUserMember, setIsUserMember] = useState<boolean | null>(null);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [originalMessages, setOriginalMessages] = useState<MessageData[]>([]);
  const [avatarMap, setAvatarMap] = useState<Map<string, string | null>>(new Map());
  const [deepCrawlEnabled, setDeepCrawlEnabled] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [referencedMessages, setReferencedMessages] = useState<Map<string, MessageData>>(new Map());
  const [draftResponse, _setDraftResponse] = useState<string | null>(null);
  const draftResponseRef = useRef<string | null>(null);
  const [isGeneratingResponse, setIsGeneratingResponse] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const setDraftResponse = (value: string | null | ((prev: string | null) => string | null)) => {
    if (typeof value === 'function') {
      _setDraftResponse(prev => {
        const newVal = value(prev);
        draftResponseRef.current = newVal;
        return newVal;
      });
    } else {
      draftResponseRef.current = value;
      _setDraftResponse(value);
    }
  };

  const toggleReference = (msg: MessageData) => {
    setReferencedMessages(prev => {
      const next = new Map(prev);
      if (next.has(msg.id)) next.delete(msg.id);
      else next.set(msg.id, msg);
      return next;
    });
  };

  const clearReferences = () => setReferencedMessages(new Map());

  // --- Chat persistence helpers ---
  const getOrCreateSession = useCallback(async (): Promise<string | null> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    if (!user?.id || !contextId) return null;

    // Try to find existing session
    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("user_id", user.id)
      .eq("context_block_id", contextId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      sessionIdRef.current = existing.id;
      setSessionId(existing.id);
      return existing.id;
    }

    // Create new session
    const { data: created, error } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, context_block_id: contextId, model: selectedModel })
      .select("id")
      .single();

    if (error || !created) {
      console.error("Failed to create chat session:", error);
      return null;
    }
    sessionIdRef.current = created.id;
    setSessionId(created.id);
    return created.id;
  }, [user?.id, contextId, selectedModel]);

  const saveMessage = useCallback(async (role: string, content: string) => {
    const sid = await getOrCreateSession();
    if (!sid) return;
    await supabase.from("chat_messages").insert({
      session_id: sid,
      role,
      content,
    });
  }, [getOrCreateSession]);

  const handleClearMemory = async () => {
    if (!sessionIdRef.current) {
      setMessages([{
        role: "assistant",
        content: `Olá! Estou aqui para ajudar com a discussão sobre "${contextBlock?.title}".\n\nVocê pode conversar comigo normalmente ou clicar em **"Gerar Resposta"** para criar uma resposta pronta para enviar ao grupo.\n\n💡 Abra o painel de contexto para referenciar mensagens.`,
      }]);
      return;
    }
    // Delete messages first, then session
    await supabase.from("chat_messages").delete().eq("session_id", sessionIdRef.current);
    await supabase.from("chat_sessions").delete().eq("id", sessionIdRef.current);
    sessionIdRef.current = null;
    setSessionId(null);
    setDraftResponse(null);
    setMessages([{
      role: "assistant",
      content: `Memória limpa! Estou pronto para começar de novo sobre "${contextBlock?.title}".`,
    }]);
    toast.success("Histórico limpo!");
  };

  const referencedIds = new Set(referencedMessages.keys());
  const referencedList = Array.from(referencedMessages.values());
  const referencedImageUrls = referencedList.filter(m => m.image_url).map(m => m.image_url!);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, draftResponse]);

  const loadAvatars = async (msgs: MessageData[]) => {
    const { data: msgPhones } = await supabase
      .from("messages")
      .select("sender_name, sender_phone")
      .in("id", msgs.map(m => m.id))
      .not("sender_phone", "is", null);
    if (!msgPhones?.length) return;
    const phoneToName = new Map<string, string>();
    for (const m of msgPhones) {
      if (m.sender_phone) phoneToName.set(m.sender_phone, m.sender_name);
    }
    const uniquePhones = [...new Set(msgPhones.map(m => m.sender_phone).filter(Boolean))];
    if (uniquePhones.length === 0) return;
    const { data: profiles } = await supabase
      .from("contact_profiles")
      .select("phone_number, avatar_url")
      .in("phone_number", uniquePhones);
    if (profiles) {
      const map = new Map<string, string | null>();
      for (const p of profiles) {
        const name = phoneToName.get(p.phone_number);
        if (name) map.set(name, p.avatar_url);
      }
      setAvatarMap(map);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!contextId || !groupId) return;
      const { data: block } = await supabase
        .from("context_blocks")
        .select("*")
        .eq("id", contextId)
        .single();
      const { data: group } = await supabase
        .from("monitored_groups")
        .select("name, whatsapp_group_id")
        .eq("id", groupId)
        .single();
      if (block) {
        setContextBlock(block);
        let contextText = `Discussão: ${block.title}\nResumo: ${block.summary}`;
        if (block.message_ids?.length) {
          const { data: msgs } = await supabase
            .from("messages")
            .select("id, sender_name, content, sent_at, whatsapp_message_id, reply_to_whatsapp_id, quoted_content, quoted_sender, image_url")
            .in("id", block.message_ids)
            .order("sent_at", { ascending: true });
          if (msgs?.length) {
            setOriginalMessages(msgs);
            loadAvatars(msgs);
            contextText += "\n\nMensagens originais:\n" + msgs.map(
              (m: any) => `${m.sender_name}: ${m.content}${m.image_url ? ' [Mensagem contém imagem]' : ''}`
            ).join("\n");
          }
        }
        (window as any).__chatContext = contextText;

        // Load saved chat history
        const welcomeMsg: Msg = {
          role: "assistant",
          content: `Olá! Estou aqui para ajudar com a discussão sobre "${block.title}".\n\nVocê pode conversar comigo normalmente ou clicar em **"Gerar Resposta"** para criar uma resposta pronta para enviar ao grupo.\n\n💡 Abra o painel de contexto para referenciar mensagens.`,
        };

        if (user?.id) {
          const { data: existingSession } = await supabase
            .from("chat_sessions")
            .select("id")
            .eq("user_id", user.id)
            .eq("context_block_id", contextId!)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingSession) {
            sessionIdRef.current = existingSession.id;
            setSessionId(existingSession.id);

            const { data: savedMsgs } = await supabase
              .from("chat_messages")
              .select("role, content")
              .eq("session_id", existingSession.id)
              .order("created_at", { ascending: true });

            if (savedMsgs && savedMsgs.length > 0) {
              // Check for a persisted draft response
              const draftMsg = savedMsgs.find(m => m.content.startsWith("__DRAFT_RESPONSE__"));
              if (draftMsg) {
                setDraftResponse(draftMsg.content.replace("__DRAFT_RESPONSE__", ""));
              }
              // Filter out draft messages from regular chat display
              const displayMsgs = savedMsgs.filter(m => !m.content.startsWith("__DRAFT_RESPONSE__"));
              const loadedMsgs: Msg[] = [welcomeMsg, ...displayMsgs.map(m => ({ role: m.role as "user" | "assistant", content: m.content }))];
              setMessages(loadedMsgs);
            } else {
              setMessages([welcomeMsg]);
            }
          } else {
            setMessages([welcomeMsg]);
          }
        } else {
          setMessages([welcomeMsg]);
        }
      }
      if (group) {
        setGroupName(group.name);
        setGroupWhatsappId(group.whatsapp_group_id);
      }
      setPageLoading(false);
    };
    fetchData();
  }, [contextId, groupId]);

  useEffect(() => {
    if (!org) return;
    const check = async () => {
      const { data } = await supabase
        .from("org_api_keys")
        .select("id")
        .eq("org_id", org.id)
        .eq("provider", "anthropic")
        .maybeSingle();
      setHasAnthropicKey(!!data);
    };
    check();
  }, [org]);

  useEffect(() => {
    if (!org || !user || !groupWhatsappId) return;
    const check = async () => {
      try {
        const { data } = await supabase.functions.invoke("check-group-membership", {
          body: { org_id: org.id, user_id: user.id, group_whatsapp_ids: [groupWhatsappId] },
        });
        if (data?.success && data.membership) {
          setIsUserMember(data.membership[groupWhatsappId] ?? false);
        }
      } catch {
        setIsUserMember(false);
      }
    };
    check();
  }, [org, user, groupWhatsappId]);

  const allModels = [...lovableModels, ...(hasAnthropicKey ? anthropicModels : [])];
  const currentModelLabel = allModels.find(m => m.value === selectedModel)?.label || "Model";

  const streamAI = async (aiMessages: any[], onChunk: (chunk: string) => void) => {
    const body: any = { messages: aiMessages, model: selectedModel, group_id: groupId };
    if (selectedModel.startsWith("anthropic/")) body.org_id = org?.id;
    const resp = await window.fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok || !resp.body) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || "Falha ao conectar com IA");
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") break;
        try {
          const parsed = JSON.parse(json);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {}
      }
    }
  };

  const detectGenerateIntent = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    const patterns = [
      /\bger[ae]\b.*\b(resposta|mensagem|texto|reply)\b/,
      /\b(resposta|mensagem|texto)\b.*\bger[ae]\b/,
      /\bcri[ae]\b.*\b(resposta|mensagem|texto)\b/,
      /\b(resposta|mensagem|texto)\b.*\bcri[ae]\b/,
      /\bescrev[ae]\b.*\b(resposta|mensagem|texto)\b/,
      /\b(resposta|mensagem)\b.*\b(para|pro|pra)\s*(o\s*)?grupo\b/,
      /\brespond[ae]\b.*\b(grupo|discussão|conversa)\b/,
      /\bmont[ae]\b.*\b(resposta|mensagem|texto)\b/,
      /\belabor[ae]\b.*\b(resposta|mensagem|texto)\b/,
      /\bredig[ae]\b.*\b(resposta|mensagem|texto)\b/,
      /\bfaç[ao]\b.*\b(resposta|mensagem|texto)\b/,
      /\bfaz\b.*\b(resposta|mensagem|texto)\b/,
    ];
    return patterns.some(p => p.test(lower));
  };

  const deepCrawlSearch = async (query: string): Promise<string> => {
    setIsCrawling(true);
    try {
      const { data, error } = await supabase.functions.invoke("firecrawl-search", {
        body: { query, options: { limit: 5, lang: "pt-BR", country: "BR" } },
      });
      if (error) throw error;
      if (!data?.success || !data?.data?.length) return "";
      return data.data.slice(0, 5).map((r: any, i: number) => {
        const content = r.markdown ? r.markdown.slice(0, 1500) : r.description || "";
        return `[Fonte ${i + 1}: ${r.title || r.url}]\nURL: ${r.url}\n${content}`;
      }).join("\n\n---\n\n");
    } catch (e: any) {
      toast.error("Erro no Deep Crawl: " + (e.message || "Falha na pesquisa"));
      return "";
    } finally {
      setIsCrawling(false);
    }
  };

  const buildReferenceContext = (): { text: string; imageUrls: string[] } => {
    if (referencedList.length === 0) return { text: "", imageUrls: [] };
    const imageUrls: string[] = [];
    const textParts = referencedList.map((m, i) => {
      if (m.image_url) imageUrls.push(m.image_url);
      return `[Ref ${i + 1}] ${m.sender_name} (${new Date(m.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}): ${m.content || "(imagem)"}${m.image_url ? " [contém imagem - veja a imagem anexada]" : ""}`;
    });
    return { text: `\n\nMensagens referenciadas pelo usuário:\n${textParts.join("\n")}`, imageUrls };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading || isGeneratingResponse) return;
    if (draftResponse !== null) { await handleRefineDraft(input); return; }
    if (detectGenerateIntent(input)) { await handleGenerateResponseFromPrompt(input); return; }

    const attachments = referencedList.length > 0 ? [...referencedList] : undefined;
    const userMsg: Msg = { role: "user", content: input, attachments };
    const userQuery = input;
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    clearReferences();
    setIsLoading(true);

    // Save user message to DB
    saveMessage("user", userQuery);

    let crawlContext = "";
    if (deepCrawlEnabled) {
      const topic = contextBlock?.title || "";
      crawlContext = await deepCrawlSearch(topic ? `${topic} ${userQuery}`.trim() : userQuery);
    }

    const { text: refText, imageUrls: refImageUrls } = buildReferenceContext();
    const contextText = (window as any).__chatContext || "";
    let systemText = `Contexto da discussão:\n${contextText}`;
    if (refText) {
      systemText += refText;
      if (refImageUrls.length > 0) {
        systemText += `\n\nATENÇÃO: O usuário referenciou ${refImageUrls.length} imagem(ns). Analise-as cuidadosamente.`;
      }
    }
    if (crawlContext) {
      systemText += `\n\nPesquisa web:\n${crawlContext}\n\nUse as informações acima quando relevante. Cite as fontes.`;
    }

    const contextContent = buildMultimodalContent(systemText, refImageUrls);
    const aiMessages = [
      { role: "user" as const, content: contextContent },
      ...newMessages.filter(m => m.role !== "assistant" || newMessages.indexOf(m) > 0),
    ];

    let assistantSoFar = "";
    try {
      await streamAI(aiMessages, (chunk) => {
        assistantSoFar += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && prev.length > 1) {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      });
      // Save assistant response to DB
      if (assistantSoFar) saveMessage("assistant", assistantSoFar);
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar resposta");
      if (!assistantSoFar) {
        setMessages(prev => [...prev, { role: "assistant", content: "Desculpe, ocorreu um erro." }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefineDraft = async (instruction: string) => {
    setInput("");
    setIsGeneratingResponse(true);
    const previousVersion = draftResponseRef.current || "";
    setMessages(prev => [...prev, { role: "user", content: instruction }]);
    saveMessage("user", instruction);
    const contextText = (window as any).__chatContext || "";
    const aiMessages = [
      { role: "system" as const, content: `Você é um assistente que refina respostas para grupos de WhatsApp.\nGere a resposta refinada COMPLETA.\nNÃO mencione que você é uma IA.\nEscreva como se fosse um membro do grupo.\nUse formatação markdown.` },
      { role: "user" as const, content: `Contexto da discussão:\n${contextText}` },
      { role: "assistant" as const, content: previousVersion },
      { role: "user" as const, content: `Ajuste a resposta acima conforme: ${instruction}` },
    ];
    let responseSoFar = "";
    try {
      await streamAI(aiMessages, (chunk) => { responseSoFar += chunk; setDraftResponse(responseSoFar); });
      setMessages(prev => [...prev, { role: "assistant", content: `__PREVIOUS_VERSION__${previousVersion}` }]);
      saveMessage("assistant", `__PREVIOUS_VERSION__${previousVersion}`);
      // Update the draft in DB: delete old draft message, save new one
      if (sessionIdRef.current) {
        await supabase.from("chat_messages").delete().eq("session_id", sessionIdRef.current).like("content", "__DRAFT_RESPONSE__%");
      }
      saveMessage("assistant", `__DRAFT_RESPONSE__${responseSoFar}`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao refinar resposta");
    } finally {
      setIsGeneratingResponse(false);
    }
  };

  const handleGenerateResponseFromPrompt = async (userPrompt: string) => {
    setInput("");
    setIsGeneratingResponse(true);
    setDraftResponse("");
    setMessages(prev => [...prev, { role: "user", content: userPrompt }]);
    saveMessage("user", userPrompt);
    const contextText = (window as any).__chatContext || "";
    const aiMessages = [
      { role: "system" as const, content: `Você é um assistente que gera respostas para grupos de WhatsApp.\nGere uma resposta clara, profissional e direta em português brasileiro.\nNÃO inclua saudações desnecessárias.\nNÃO mencione que você é uma IA.\nEscreva como membro do grupo.\nUse formatação markdown.` },
      { role: "user" as const, content: `Contexto da discussão:\n${contextText}` },
      { role: "user" as const, content: userPrompt },
    ];
    let responseSoFar = "";
    try {
      await streamAI(aiMessages, (chunk) => { responseSoFar += chunk; setDraftResponse(responseSoFar); });
      if (responseSoFar) saveMessage("assistant", `__DRAFT_RESPONSE__${responseSoFar}`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar resposta");
      if (!responseSoFar) setDraftResponse(null);
    } finally {
      setIsGeneratingResponse(false);
    }
  };

  const handleGenerateResponse = async () => {
    if (isLoading || isGeneratingResponse) return;
    setIsGeneratingResponse(true);
    setDraftResponse("");
    const genMsg: Msg = { role: "user", content: "Gere uma resposta completa e profissional para enviar ao grupo." };
    setMessages(prev => [...prev, genMsg]);
    saveMessage("user", genMsg.content);
    const contextText = (window as any).__chatContext || "";
    const conversationSoFar = [...messages, genMsg].filter(m => m.role !== "assistant" || [...messages, genMsg].indexOf(m) > 0);
    const aiMessages = [
      { role: "system" as const, content: `Você é um assistente que gera respostas para grupos de WhatsApp.\nGere uma resposta clara, profissional e direta em português brasileiro.\nNÃO inclua saudações desnecessárias.\nNÃO mencione que você é uma IA.\nEscreva como membro do grupo.\nUse formatação markdown.` },
      { role: "user" as const, content: `Contexto da discussão:\n${contextText}` },
      ...conversationSoFar,
    ];
    let responseSoFar = "";
    try {
      await streamAI(aiMessages, (chunk) => { responseSoFar += chunk; setDraftResponse(responseSoFar); });
      if (responseSoFar) saveMessage("assistant", `__DRAFT_RESPONSE__${responseSoFar}`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar resposta");
      if (!responseSoFar) setDraftResponse(null);
    } finally {
      setIsGeneratingResponse(false);
    }
  };

  const handleSendToGroup = async (content: string, stripFormatting?: boolean) => {
    if (!org || !user || !groupWhatsappId) return;
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-group-message", {
        body: { org_id: org.id, user_id: user.id, group_whatsapp_id: groupWhatsappId, message: content, strip_formatting: stripFormatting || false },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao enviar");
      toast.success("Mensagem enviada ao grupo!");
      // Keep the sent message in chat with a "sent" marker
      const sentContent = content;
      // Remove draft from DB
      if (sessionIdRef.current) {
        await supabase.from("chat_messages").delete().eq("session_id", sessionIdRef.current).like("content", "__DRAFT_RESPONSE__%");
      }
      setDraftResponse(null);
      // Add the sent message to the chat history
      const sentMsg: Msg = { role: "assistant", content: `__SENT_MESSAGE__${sentContent}` };
      setMessages(prev => [...prev, sentMsg]);
      saveMessage("assistant", `__SENT_MESSAGE__${sentContent}`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar mensagem");
    } finally {
      setIsSending(false);
    }
  };

  const handleDiscardDraft = async () => {
    // Remove draft from DB
    if (sessionIdRef.current) {
      await supabase.from("chat_messages").delete().eq("session_id", sessionIdRef.current).like("content", "__DRAFT_RESPONSE__%");
    }
    setDraftResponse(null);
    setMessages(prev => [...prev, { role: "assistant", content: "Resposta descartada. Posso gerar outra ou continuar conversando." }]);
  };

  if (pageLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>;
  }

  const markdownClasses = "prose prose-sm dark:prose-invert max-w-none leading-relaxed [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:bg-muted/50 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_pre]:bg-muted [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs";

  return (
    <div className="flex h-full relative">
      {/* Main chat area */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Messages with sticky header */}
        <div className="flex-1 overflow-y-auto">
          {/* Sticky blur header */}
          <div className="sticky top-0 z-20 backdrop-blur-md bg-background/60 px-3 md:px-4 h-14 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5 md:gap-3 min-w-0 flex-1">
              {isMobile && mobileMenu && (
                <button
                  onClick={mobileMenu.openMobileMenu}
                  className="p-1.5 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
                >
                  <Menu className="h-4 w-4" />
                </button>
              )}
              <Link to={`/group/${groupId}`} className="min-w-0 flex-1 text-center hover:opacity-80 transition-opacity">
                <h2 className="text-sm font-semibold text-foreground truncate">{contextBlock?.title}</h2>
                <p className="text-[11px] text-muted-foreground truncate">{groupName}</p>
              </Link>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="shrink-0 h-8 w-8 relative"
              title="Ver contexto"
            >
              <Layers className="h-4 w-4" />
              {referencedList.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-medium">
                  {referencedList.length}
                </span>
              )}
            </Button>
          </div>

          <div className="px-3 md:px-6 py-4 space-y-3">
          {messages.map((msg, i) => {
            if (msg.role === "assistant" && msg.content.startsWith("__PREVIOUS_VERSION__")) {
              const versionContent = msg.content.replace("__PREVIOUS_VERSION__", "");
              return <PreviousVersionCard key={i} content={versionContent} index={i} markdownClasses={markdownClasses} />;
            }

            if (msg.role === "assistant" && msg.content.startsWith("__SENT_MESSAGE__")) {
              const sentContent = msg.content.replace("__SENT_MESSAGE__", "");
              return (
                <div key={i} className="flex gap-2 md:gap-3 animate-fade-in">
                  <div className="h-7 w-7 md:h-8 md:w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <Send className="h-3.5 w-3.5 md:h-4 md:w-4 text-emerald-500" />
                  </div>
                  <div className="rounded-xl px-3 py-2.5 md:px-4 md:py-3 text-sm bg-card border border-emerald-500/30 text-foreground max-w-[90%] md:max-w-[75%]">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-[9px] leading-none px-2 py-0.5 rounded-sm font-semibold border-emerald-500/40 bg-emerald-500/10 text-emerald-500">
                        Enviada ao grupo
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className={markdownClasses}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{sentContent}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className={`flex gap-2 md:gap-3 animate-fade-in ${msg.role === "user" ? "justify-end" : ""}`}>
                {msg.role === "assistant" && (
                  <div className="h-7 w-7 md:h-8 md:w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Bot className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
                  </div>
                )}
                <div className={cn(
                  "rounded-xl px-3 py-2.5 md:px-4 md:py-3 text-sm",
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground max-w-[85%] md:max-w-[70%]"
                    : "bg-card border border-border/50 text-foreground max-w-[90%] md:max-w-[75%]"
                )}>
                  {msg.role === "user" && msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-2 space-y-1">
                      {msg.attachments.map((att) => (
                        <div key={att.id} className="flex items-start gap-2 p-1.5 rounded-lg bg-black/15 border border-white/10">
                          {att.image_url && (
                            <img src={att.image_url} alt="Imagem" className="h-12 w-12 rounded object-cover shrink-0 cursor-pointer" onClick={() => window.open(att.image_url!, '_blank')} />
                          )}
                          <div className="flex-1 min-w-0">
                            <SenderName name={att.sender_name} className="text-[10px] font-semibold text-primary-foreground/90" />
                            <p className="text-[11px] text-primary-foreground/80 line-clamp-1">{att.content || "📷 Imagem"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.role === "assistant" ? (
                    <div className={markdownClasses}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {msg.role === "assistant" && i > 0 && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-border/50">
                      <button
                        onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copiado!"); }}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                      >
                        <Copy className="h-3 w-3" /> Copiar
                      </button>
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="h-7 w-7 md:h-8 md:w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                    <User className="h-3.5 w-3.5 md:h-4 md:w-4 text-muted-foreground" />
                  </div>
                )}
              </div>
            );
          })}

          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-2 md:gap-3">
              <div className="h-7 w-7 md:h-8 md:w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary" />
              </div>
              <div className="bg-card border border-border/50 rounded-xl px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          {draftResponse !== null && (
            <GroupResponseCard
              content={draftResponse}
              isGenerating={isGeneratingResponse}
              onSendToGroup={handleSendToGroup}
              isSending={isSending}
              canSend={isUserMember === true}
              onDiscard={handleDiscardDraft}
              onContentUpdate={(newContent) => setDraftResponse(newContent)}
            />
          )}

          <div ref={endRef} />
        </div>
        </div>

        {/* Input area */}
        <div className="border-t border-border p-3 md:p-4 shrink-0">
          {referencedList.length > 0 && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <Pin className="h-3 w-3 text-primary shrink-0" />
              <span className="text-[11px] text-primary font-medium">
                {referencedList.length} ref{referencedImageUrls.length > 0 && ` · ${referencedImageUrls.length} img`}
              </span>
              <button onClick={clearReferences} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {deepCrawlEnabled && (
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Globe className="h-3 w-3 text-primary animate-pulse" />
              <span className="text-[11px] text-primary font-medium">Deep Crawl ativo</span>
            </div>
          )}
          {isCrawling && (
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <Search className="h-3 w-3 text-primary animate-spin" />
              <span className="text-[11px] text-muted-foreground">Pesquisando...</span>
            </div>
          )}

          {/* Input row */}
          <div className="flex gap-1.5 items-center">
            {/* Single menu button with popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    "shrink-0 p-2 rounded-xl transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/60 relative",
                    deepCrawlEnabled && "text-primary"
                  )}
                  title="Opções"
                >
                  <Settings2 className="h-4 w-4" />
                  {deepCrawlEnabled && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-56 p-2 z-[60] bg-popover border border-border shadow-lg">
                {/* Deep Crawl toggle */}
                <button
                  onClick={() => setDeepCrawlEnabled(!deepCrawlEnabled)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors",
                    deepCrawlEnabled ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span>Deep Crawl</span>
                  {deepCrawlEnabled && <CheckCircle2 className="h-3 w-3 ml-auto" />}
                </button>

                <div className="border-t border-border my-1.5" />

                {/* Model selector */}
                <p className="text-[10px] text-muted-foreground px-2.5 py-1 uppercase tracking-wider">Modelo</p>
                {allModels.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => { setSelectedModel(m.value); localStorage.setItem("chat-selected-model", m.value); }}
                    className={cn(
                      "w-full text-left text-xs px-2.5 py-1.5 rounded-md transition-colors",
                      selectedModel === m.value ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {m.label}
                  </button>
                ))}

                <div className="border-t border-border my-1.5" />

                {/* Clear memory */}
                <button
                  onClick={handleClearMemory}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Limpar memória</span>
                </button>
              </PopoverContent>
            </Popover>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={draftResponse !== null ? "Peça ajustes..." : referencedList.length > 0 ? "Pergunte sobre as referências..." : "Converse sobre a discussão..."}
              disabled={isLoading || isGeneratingResponse || isCrawling}
              className="flex-1 min-w-0 bg-secondary border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
            {/* Send / Generate toggle */}
            {input.trim() || draftResponse !== null ? (
              <Button
                onClick={handleSend}
                size="icon"
                className="shrink-0 rounded-xl h-9 w-9 animate-in zoom-in-75 duration-150"
                disabled={isLoading || isGeneratingResponse || isCrawling}
              >
                <Send className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleGenerateResponse}
                size="icon"
                variant="outline"
                className="shrink-0 rounded-xl h-9 w-9 border-primary/30 text-primary hover:bg-primary/10 animate-in zoom-in-75 duration-150"
                disabled={isLoading || isGeneratingResponse || isCrawling}
                title="Gerar Resposta"
              >
                <FileText className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      {sidebarOpen && !isMobile && (
        <div className="w-[340px] border-l border-border flex flex-col shrink-0 bg-background animate-fade-in">
          <ContextPanelContent
            contextBlock={contextBlock}
            originalMessages={originalMessages}
            referencedIds={referencedIds}
            referencedList={referencedList}
            toggleReference={toggleReference}
            avatarMap={avatarMap}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Mobile overlay */}
      {sidebarOpen && isMobile && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 right-0 z-50 w-[85vw] max-w-[360px] flex flex-col bg-background border-l border-border animate-slide-left">
            <ContextPanelContent
              contextBlock={contextBlock}
              originalMessages={originalMessages}
              referencedIds={referencedIds}
              referencedList={referencedList}
              toggleReference={toggleReference}
              avatarMap={avatarMap}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}

function PreviousVersionCard({ content, index, markdownClasses }: { content: string; index: number; markdownClasses: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-2 md:mx-4 my-2 animate-fade-in">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/50 transition-colors text-xs text-muted-foreground"
      >
        <History className="h-3.5 w-3.5 text-primary/60" />
        <span className="font-medium">Versão anterior</span>
        <span className="ml-auto">
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      {open && (
        <div className="mt-1 rounded-lg border border-border/40 bg-background/50 px-4 py-3 max-h-60 overflow-y-auto text-sm">
          <div className={markdownClasses}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
