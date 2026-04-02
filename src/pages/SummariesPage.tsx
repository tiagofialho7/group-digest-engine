import { useState, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, Loader2, FileText,
  Sparkles, Play
} from "lucide-react";
import { format, subDays, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useGroupPictures } from "@/hooks/useGroupPictures";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import SummaryReport from "@/components/summaries/SummaryReport";

interface SummaryContent {
  overview: string;
  total_messages: number;
  topics: { title: string; summary: string; status: string; participants: string[]; message_count?: number }[];
  stats: { total_questions: number; answered: number; unanswered: number; media_shared?: number };
  top_contributors: { name: string; messages_sent: number; questions_answered: number; helpfulness_score: number; role_tag: string }[];
  top_responders?: { name: string; contributions: number; topics: string[] }[];
  engagement: { active_participants: number; peak_hour: string | null; messages_per_hour: { hour: string; count: number }[]; avg_response_time_min: number | null };
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    context?: { positive?: string; neutral?: string; negative?: string };
    examples?: {
      positive: { sender: string; content: string; time: string }[];
      neutral: { sender: string; content: string; time: string }[];
      negative: { sender: string; content: string; time: string }[];
    };
  };
  highlights: string[];
  action_items?: { description: string; assignee: string | null; priority: string }[];
}

export default function SummariesPage() {
  const { org } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const summaryDate = useMemo(() => format(selectedDate, "yyyy-MM-dd"), [selectedDate]);

  const { data: groups = [], isLoading: groupsLoading } = useQuery({
    queryKey: ["summaries-groups", org?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("monitored_groups")
        .select("id, name, whatsapp_group_id, picture_url, is_active")
        .eq("org_id", org!.id)
        .eq("is_active", true);
      return data || [];
    },
    enabled: !!org?.id,
  });

  // Auto-select first group
  const activeGroupId = selectedGroupId ?? groups[0]?.id ?? null;

  const pictures = useGroupPictures(org?.id, groups);

  const selectedGroup = groups.find(g => g.id === activeGroupId);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["daily-summary", activeGroupId, summaryDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_summaries")
        .select("content")
        .eq("group_id", activeGroupId!)
        .eq("summary_date", summaryDate)
        .maybeSingle();
      return data ? (data.content as unknown as SummaryContent) : null;
    },
    enabled: !!activeGroupId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("generate-daily-summary", {
        body: { group_id: activeGroupId, summary_date: summaryDate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["daily-summary", activeGroupId, summaryDate] });
      toast({ title: "Resumo gerado com sucesso!" });
    },
    onError: (err: any) => {
      toast({ title: "Erro ao gerar resumo", description: err.message, variant: "destructive" });
    },
  });

  const loading = groupsLoading;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-border/50">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Resumos Diários</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Group selector */}
          {groups.length > 0 && (
            <Select value={activeGroupId ?? ""} onValueChange={setSelectedGroupId}>
              <SelectTrigger className="w-[220px] h-10">
                <SelectValue placeholder="Selecionar grupo" />
              </SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.id}>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-5 w-5 rounded-md shrink-0">
                        {pictures[g.id] && <AvatarImage src={pictures[g.id]!} className="object-cover" />}
                        <AvatarFallback className="rounded-md bg-primary/10 text-primary text-[9px] font-semibold">
                          {g.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{g.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Date nav */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSelectedDate(d => subDays(d, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 text-xs font-medium px-3 py-2">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {isToday(selectedDate) ? "Hoje" : format(selectedDate, "dd MMM", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => { if (d) { setSelectedDate(d); setCalendarOpen(false); } }}
                  disabled={(d) => d > new Date()}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setSelectedDate(d => { const next = new Date(d); next.setDate(next.getDate() + 1); return next; })} disabled={isToday(selectedDate)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 text-primary animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 p-16 text-center max-w-md mx-auto">
          <FileText className="h-12 w-12 text-muted-foreground/60 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-foreground mb-2">Nenhum grupo monitorado</h3>
          <p className="text-sm text-muted-foreground">Adicione grupos para gerar resumos diários.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Generate button */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {summaryLoading
                ? "Carregando resumo..."
                : summary
                  ? `Resumo disponível • ${summary.total_messages} mensagens`
                  : "Nenhum resumo gerado para esta data"}
            </p>
            <Button
              size="sm"
              variant={summary ? "outline" : "default"}
              className="gap-2 text-xs h-9 px-4"
              disabled={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : summary ? (
                <Sparkles className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {summary ? "Regerar" : "Gerar Resumo"}
            </Button>
          </div>

          {/* Summary report */}
          {summaryLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
          ) : summary ? (
            <SummaryReport summary={summary} />
          ) : (
            <div className="rounded-xl border border-dashed border-border/50 p-12 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Clique em "Gerar Resumo" para analisar as mensagens do dia.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
