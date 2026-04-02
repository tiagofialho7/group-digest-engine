import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Maximize2, Edit3, Send, Copy, Check, X, Loader2, History, ChevronDown, ChevronUp, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface EditHistoryEntry {
  content: string;
  timestamp: Date;
}

interface GroupResponseCardProps {
  content: string;
  isGenerating: boolean;
  onSendToGroup: (content: string, stripFormatting?: boolean) => Promise<void>;
  isSending: boolean;
  canSend: boolean;
  onDiscard: () => void;
  onContentUpdate?: (newContent: string) => void;
}

const markdownClasses =
  "prose prose-sm dark:prose-invert max-w-none leading-relaxed [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:bg-muted/50 [&_th]:text-left [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5 [&_pre]:bg-muted [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs";

export default function GroupResponseCard({
  content,
  isGenerating,
  onSendToGroup,
  isSending,
  canSend,
  onDiscard,
  onContentUpdate,
}: GroupResponseCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [copied, setCopied] = useState(false);
  const [manualEditHistory, setManualEditHistory] = useState<EditHistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [stripFormatting, setStripFormatting] = useState(() => {
    return localStorage.getItem("wa-strip-formatting") === "true";
  });
  const isMobile = useIsMobile();

  const toggleStripFormatting = () => {
    setStripFormatting(prev => {
      const next = !prev;
      localStorage.setItem("wa-strip-formatting", String(next));
      return next;
    });
  };

  const displayContent = isEditing ? editedContent : content;

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent);
    setCopied(true);
    toast.success("Copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartEdit = () => {
    setEditedContent(content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setManualEditHistory(prev => [...prev, { content, timestamp: new Date() }]);
    onContentUpdate?.(editedContent);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSend = async () => {
    const textToSend = isEditing ? editedContent : content;
    await onSendToGroup(textToSend, stripFormatting);
  };

  // --- Shared content renderer ---
  const renderContent = (maxHeight?: string, fillHeight = false) => (
    <div className={cn("overflow-y-auto text-sm", maxHeight, fillHeight && "flex-1 flex flex-col")}>
      {isEditing ? (
        <Textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className={cn(
            "text-sm bg-background border-0 focus-visible:ring-0 resize-none",
            fillHeight ? "flex-1 min-h-0 h-full" : "min-h-[200px]"
          )}
        />
      ) : (
        <div className={markdownClasses}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content || "Gerando resposta..."}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );

  // --- Shared action bar ---
  const renderActions = (compact = false) => (
    <div className={cn("flex items-center gap-2", compact ? "justify-between" : "justify-between")}>
      <div className="flex items-center gap-1">
        {isEditing ? (
          <>
            <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="gap-1.5 text-xs h-8">
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSaveEdit} className="gap-1.5 text-xs h-8 text-primary">
              <Check className="h-3.5 w-3.5" /> Salvar
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={handleStartEdit} className="gap-1.5 text-xs h-8">
              <Edit3 className="h-3.5 w-3.5" /> Editar
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5 text-xs h-8">
              {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </>
        )}
      </div>
      {canSend && !isGenerating && (
        <div className="flex items-center gap-2">
          <button
            onClick={toggleStripFormatting}
            className={cn(
              "px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
              stripFormatting
                ? "bg-destructive/10 text-destructive"
                : "bg-muted/50 text-muted-foreground hover:text-foreground"
            )}
          >
            {stripFormatting ? "Sem fmt" : "Com fmt"}
          </button>
          <Button size="sm" onClick={handleSend} disabled={isSending} className="gap-1.5 text-xs h-8">
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <><Send className="h-3.5 w-3.5" /> Enviar</>
            )}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Inline card */}
      <div className="mx-2 md:mx-4 my-3 rounded-xl bg-muted/30 overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs font-medium text-foreground">Resposta para o grupo</span>
            {isGenerating && <Loader2 className="h-3 w-3 text-primary animate-spin" />}
          </div>
          <div className="flex items-center gap-0.5">
            {manualEditHistory.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <History className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setIsExpanded(true)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Tela cheia"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            {!isGenerating && (
              <button
                onClick={onDiscard}
                className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                title="Descartar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* History */}
        {showHistory && manualEditHistory.length > 0 && (
          <div className="px-4 pb-2 space-y-1.5">
            {manualEditHistory.map((entry, idx) => (
              <HistoryItem key={idx} entry={entry} idx={idx} total={manualEditHistory.length} />
            ))}
          </div>
        )}

        {/* Body preview (limited height) */}
        <div className="px-4 pb-2">
          {renderContent("max-h-40")}
        </div>

        {/* Actions */}
        {!isGenerating && (
          <div className="px-4 py-2.5 border-t border-border/30">
            {renderActions(true)}
          </div>
        )}
      </div>

      {/* Expanded view: fullscreen on mobile, centered modal on desktop */}
      {isExpanded && (
        <div className="absolute inset-0 z-30 flex flex-col bg-background animate-in fade-in-0 duration-200">
            {/* Header */}
            <div className={cn(
              "flex items-center justify-between shrink-0",
              isMobile
                ? "px-4 h-14 backdrop-blur-md bg-background/80"
                : "px-6 py-4"
            )}>
              <div className="flex items-center gap-2.5">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Resposta para o grupo</h2>
                  {isGenerating && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Gerando...
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {!isGenerating && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDiscard}
                    className="text-xs text-muted-foreground hover:text-destructive h-8"
                  >
                    Descartar
                  </Button>
                )}
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isMobile ? <X className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border/30" />

            {/* Content */}
            <div className={cn(
              "flex-1 overflow-y-auto flex flex-col min-h-0",
              isMobile ? "px-4 py-4" : "px-6 py-5"
            )}>
              {renderContent(undefined, true)}
            </div>

            {/* Footer */}
            {!isGenerating && (
              <div className={cn(
                "shrink-0 border-t border-border/30",
                isMobile ? "px-4 py-3 pb-safe" : "px-6 py-4"
              )}>
                {renderActions()}
              </div>
            )}
        </div>
      )}
    </>
  );
}

function HistoryItem({ entry, idx, total }: { entry: EditHistoryEntry; idx: number; total: number }) {
  const [open, setOpen] = useState(false);
  const time = entry.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-lg bg-background/50">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>Versão {idx + 1} de {total} — {time}</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="px-2.5 pb-2 text-xs text-muted-foreground whitespace-pre-wrap max-h-32 overflow-y-auto border-t border-border/20">
          {entry.content}
        </div>
      )}
    </div>
  );
}
