import { useState } from "react";
import {
  CheckCircle2, CircleDot, Clock, Users, MessageSquare,
  TrendingUp, Zap, AlertTriangle, HelpCircle, Trophy, ChevronDown
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

interface SentimentExample {
  sender: string;
  content: string;
  time: string;
}

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
    context?: {
      positive?: string;
      neutral?: string;
      negative?: string;
    };
    examples?: {
      positive: SentimentExample[];
      neutral: SentimentExample[];
      negative: SentimentExample[];
    };
  };
  highlights: string[];
  action_items?: { description: string; assignee: string | null; priority: string }[];
}

export default function SummaryReport({ summary }: { summary: SummaryContent }) {
  const s = summary;
  const contributors = s.top_contributors?.length ? s.top_contributors : (s.top_responders || []).map(r => ({
    name: r.name, messages_sent: r.contributions, questions_answered: r.contributions,
    helpfulness_score: 7, role_tag: "💬 Comunicador",
  }));

  const answeredRate = s.stats.total_questions > 0
    ? Math.round((s.stats.answered / s.stats.total_questions) * 100) : 100;

  const sentimentData = [
    { name: "Positivo", value: s.sentiment?.positive ?? 0, fill: "hsl(var(--success))" },
    { name: "Neutro", value: s.sentiment?.neutral ?? 0, fill: "hsl(var(--muted-foreground))" },
    { name: "Negativo", value: s.sentiment?.negative ?? 0, fill: "hsl(var(--destructive))" },
  ];

  const activityData = (s.engagement?.messages_per_hour || []).map(h => ({
    hour: h.hour, count: h.count,
  }));

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card className="bg-muted/20 border-border/50">
        <CardContent className="p-5">
          <p className="text-[15px] text-foreground/80 leading-relaxed">{s.overview}</p>
        </CardContent>
      </Card>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard icon={<MessageSquare className="h-4 w-4" />} label="Mensagens" value={s.total_messages} />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Participantes" value={s.engagement?.active_participants ?? "–"} />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Pico" value={s.engagement?.peak_hour ?? "–"} />
        <KpiCard
          icon={<Zap className="h-4 w-4" />}
          label="Resp. Média"
          value={s.engagement?.avg_response_time_min != null ? `${s.engagement.avg_response_time_min}m` : "–"}
        />
      </div>

      {/* Questions resolution + Sentiment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Resolution rate */}
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resolução de dúvidas</span>
              <span className="text-2xl font-bold text-foreground">{answeredRate}%</span>
            </div>
            <Progress value={answeredRate} className="h-2.5" />
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success" />{s.stats.answered} respondidas</span>
              {s.stats.unanswered > 0 && (
                <span className="flex items-center gap-1.5"><HelpCircle className="h-3.5 w-3.5 text-warning" />{s.stats.unanswered} pendentes</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sentiment */}
        {s.sentiment && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sentimento</span>
              <SentimentSection sentiment={s.sentiment} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Activity chart */}
      {activityData.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Atividade por hora</span>
            <div className="h-40 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={activityData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top contributors */}
      {contributors.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Contribuidores</span>
            <div className="mt-4 space-y-3">
              {contributors.slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-center gap-4 py-2">
                  <div className="w-6 text-center">
                    {i === 0 ? <Trophy className="h-5 w-5 text-accent mx-auto" /> :
                      <span className="text-sm font-bold text-muted-foreground">{i + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground truncate">{c.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-2 py-0.5 h-5 shrink-0">{c.role_tag}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">{c.messages_sent} msgs</span>
                      <span className="text-xs text-muted-foreground">{c.questions_answered} respostas</span>
                    </div>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <ScoreBadge score={c.helpfulness_score} />
                      </TooltipTrigger>
                      <TooltipContent side="left">
                        <p className="text-xs">Score de valor: {c.helpfulness_score}/10</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Topics */}
      {s.topics.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tópicos Discutidos</span>
            <div className="mt-4 space-y-3">
              {s.topics.map((t, i) => (
                <div key={i} className="flex items-start gap-3 py-2">
                  {t.status === "resolved" ? (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-1" />
                  ) : t.status === "in_progress" ? (
                    <CircleDot className="h-4 w-4 text-info shrink-0 mt-1" />
                  ) : (
                    <CircleDot className="h-4 w-4 text-warning shrink-0 mt-1" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{t.title}</span>
                      {t.message_count && (
                        <span className="text-xs text-muted-foreground">{t.message_count} msgs</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{t.summary}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action items */}
      {s.action_items && s.action_items.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pendências</span>
            <div className="mt-4 space-y-2.5">
              {s.action_items.map((a, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm py-1">
                  <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${
                    a.priority === "high" ? "text-destructive" : a.priority === "medium" ? "text-warning" : "text-muted-foreground"
                  }`} />
                  <span className="text-foreground/90 flex-1">{a.description}</span>
                  {a.assignee && <Badge variant="outline" className="text-xs ml-auto shrink-0 h-6">{a.assignee}</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Highlights */}
      {s.highlights?.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-5">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">✨ Destaques</span>
            <ul className="mt-3 space-y-2">
              {s.highlights.map((h, i) => (
                <li key={i} className="text-sm text-foreground/80 flex items-start gap-2 leading-relaxed">
                  <span className="text-primary mt-1">•</span>{h}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
          {icon}
        </div>
        <div>
          <p className="text-xl font-bold text-foreground leading-none">{value}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SentimentSection({ sentiment }: { sentiment: SummaryContent["sentiment"] }) {
  const [open, setOpen] = useState<string | null>(null);
  const categories = [
    { key: "positive" as const, label: "Positivo", color: "bg-success", borderColor: "border-l-success" },
    { key: "neutral" as const, label: "Neutro", color: "bg-muted-foreground/40", borderColor: "border-l-muted-foreground" },
    { key: "negative" as const, label: "Negativo", color: "bg-destructive", borderColor: "border-l-destructive" },
  ];

  return (
    <div className="space-y-2">
      {categories.map(({ key, label, color, borderColor }) => {
        const value = sentiment[key];
        const examples = sentiment.examples?.[key] || [];
        const isOpen = open === key;
        const hasExamples = examples.length > 0;

        return (
          <Collapsible key={key} open={isOpen} onOpenChange={() => setOpen(isOpen ? null : key)}>
            <CollapsibleTrigger className="w-full" disabled={!hasExamples}>
              <div className={`flex items-center gap-2.5 py-2 px-2 rounded-lg transition-colors ${hasExamples ? "cursor-pointer hover:bg-muted/50" : ""}`}>
                <span className="text-xs text-muted-foreground w-16 text-right font-medium">{label}</span>
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
                </div>
                <span className="text-xs font-semibold text-foreground w-10">{value}%</span>
                {hasExamples && (
                  <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="ml-[5rem] mr-2 mt-2 mb-3 space-y-2">
                {sentiment.context?.[key] && (
                  <p className="text-sm text-foreground/80 italic mb-3 leading-relaxed">
                    {sentiment.context[key]}
                  </p>
                )}
                {examples.map((ex, i) => (
                  <div key={i} className={`border-l-2 ${borderColor} pl-3 py-2 bg-muted/30 rounded-r-lg`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{ex.time}</span>
                      <span className="text-sm font-medium text-foreground">{ex.sender}</span>
                    </div>
                    <p className="text-sm text-foreground/70 mt-1 line-clamp-2">"{ex.content}"</p>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}

function SentimentBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-14 text-right">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-medium text-foreground w-8">{value}%</span>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "bg-success text-success-foreground" :
    score >= 5 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground";
  return (
    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${color}`}>
      {score}
    </div>
  );
}
