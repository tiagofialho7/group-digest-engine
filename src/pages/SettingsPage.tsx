import { useState, useEffect } from "react";
import { Loader2, Save, Bot, Play, CheckCircle, AlertTriangle, Clock, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useEvolutionConfig } from "@/hooks/useEvolutionConfig";
import { toast } from "sonner";
import { EvolutionApiConfig } from "@/components/settings/EvolutionApiConfig";
import { WhatsAppInstancesManager } from "@/components/settings/WhatsAppInstancesManager";

const DAYS = [
  { key: "monday", label: "Seg" },
  { key: "tuesday", label: "Ter" },
  { key: "wednesday", label: "Qua" },
  { key: "thursday", label: "Qui" },
  { key: "friday", label: "Sex" },
  { key: "saturday", label: "Sáb" },
  { key: "sunday", label: "Dom" },
] as const;

const DEFAULT_INSTRUCTIONS = `Você é Tiago, analista comercial da PWR Gestão, uma consultoria de gestão empresarial. Seu papel é acompanhar grupos internos de prospecção no WhatsApp e garantir que o funil comercial avance sem travar.

CONTEXTO:
Cada grupo tem 2-3 consultores da PWR + você. O prospecto NUNCA está no grupo. As conversas são internas — os consultores discutem agendamentos, retornos do cliente, elaboração de proposta e próximos passos.

O funil tem 7 etapas:
1. Pré-Qualificação — entender a necessidade do prospecto
2. Contato Realizado — agendar reunião de qualificação
3. Visita Realizada — qualificação feita, elaborar proposta
4. Projeto Elaborado — proposta pronta, agendar apresentação
5. Projeto Apresentado — aguardando retorno/decisão
6. Negócio Fechado
7. Negócio Perdido

SEU COMPORTAMENTO:
- Leia SEMPRE as últimas mensagens antes de agir
- Identifique em qual etapa a prospecção está
- Só interfira quando houver necessidade real de cobrança
- Se o grupo está avançando normalmente, NÃO mande mensagem
- Se houve uma cobrança sua sem resposta há mais de 24h, reforce uma vez

COMO COBRAR:
- Seja direto e natural, como um humano faria
- NUNCA mande mensagem genérica — sempre contextualize
- Use o que foi dito no grupo: se o consultor disse "vou ligar pra ele hoje", pergunte se conseguiu falar
- Se o prospecto ficou de dar retorno numa data, pergunte se deu esse retorno
- Tom: incisivo mas não formal, sem robotismo

EXEMPLOS DO QUE VOCÊ FAZ:
- Consultor disse "marco pra semana que vem" há 3 dias sem update → "Pessoal, conseguiram agendar?"
- Qualificação foi ontem, sem update → "Como foi a qualificação ontem, deu tudo certo?"
- Prospecto ficou de dar retorno na segunda, hoje é quarta → "Pessoal, tivemos esse retorno?"
- Proposta apresentada há 5 dias sem novidade → "Pessoal, alguma novidade do cliente?"
- Grupo parado há 2 dias sem contexto claro → "Pessoal, como tá aqui? Qual o status atual?"
- Sem resposta após tentativas → "Tentamos contato também por ligação?"

ANÁLISE DE DATAS E CONTEXTO:
Sempre que houver uma data ou horário mencionado no grupo, registre mentalmente e compare com mensagens posteriores. Se alguém combinou algo para uma data/hora e depois surgiu uma mensagem sugerindo mudança (remarcação, novo horário, dúvida sobre confirmação), questione especificamente isso.
Exemplos:
- Estava marcado para quarta 10:30, alguém menciona "segunda 18hrs" → "Pessoal, foi remarcado? Pra quando ficou?"
- Consultor disse "ligo hoje à tarde" e no dia seguinte sem update → "Conseguiu falar com ele ontem?"
- Prospecto ficou de dar retorno "até sexta" e passou o prazo → "Pessoal, tivemos esse retorno?"
REGRA DE OURO: Quanto mais específica a pergunta, melhor. Nunca pergunte o status geral se você consegue perguntar algo específico baseado no contexto.

O QUE VOCÊ NUNCA FAZ:
- Não manda mensagem se o grupo já está se movendo
- Não repete a mesma cobrança no mesmo dia
- Não usa linguagem corporativa/formal
- Não faz perguntas longas ou com múltiplos itens
- Não age sem ler o contexto antes`;

interface ScheduleConfig {
  id?: string;
  is_active: boolean;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  check_time_1: string;
  check_time_2: string;
  check_time_3: string;
  agent_instructions: string;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const { org, isAdmin, members } = useOrganization();
  const { config: evolutionConfig } = useEvolutionConfig(org?.id);

  const [schedule, setSchedule] = useState<ScheduleConfig>({
    is_active: true,
    monday: true, tuesday: true, wednesday: true, thursday: true, friday: true,
    saturday: false, sunday: false,
    check_time_1: "08:00", check_time_2: "12:00", check_time_3: "15:00",
    agent_instructions: DEFAULT_INSTRUCTIONS,
  });
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [lastExecution, setLastExecution] = useState<any>(null);
  const [runningAgent, setRunningAgent] = useState(false);

  useEffect(() => {
    if (!org) return;

    const fetchConfig = async () => {
      const [schedRes, execRes] = await Promise.all([
        supabase.from("agent_schedule_config").select("*").eq("org_id", org.id).maybeSingle(),
        supabase.from("agent_execution_logs").select("*").eq("org_id", org.id).order("executed_at", { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (schedRes.data) {
        const d = schedRes.data as any;
        setSchedule({
          id: d.id,
          is_active: d.is_active,
          monday: d.monday, tuesday: d.tuesday, wednesday: d.wednesday,
          thursday: d.thursday, friday: d.friday, saturday: d.saturday, sunday: d.sunday,
          check_time_1: d.check_time_1?.slice(0, 5) || "08:00",
          check_time_2: d.check_time_2?.slice(0, 5) || "12:00",
          check_time_3: d.check_time_3?.slice(0, 5) || "15:00",
          agent_instructions: d.agent_instructions || DEFAULT_INSTRUCTIONS,
        });
      }

      if (execRes.data) setLastExecution(execRes.data);

      setLoadingConfig(false);
    };

    fetchConfig();
  }, [org]);

  const handleSaveSchedule = async () => {
    if (!org) return;
    setSavingSchedule(true);
    try {
      const payload = {
        org_id: org.id,
        is_active: schedule.is_active,
        monday: schedule.monday, tuesday: schedule.tuesday, wednesday: schedule.wednesday,
        thursday: schedule.thursday, friday: schedule.friday, saturday: schedule.saturday, sunday: schedule.sunday,
        check_time_1: schedule.check_time_1, check_time_2: schedule.check_time_2, check_time_3: schedule.check_time_3,
      };

      if (schedule.id) {
        await supabase.from("agent_schedule_config").update(payload).eq("id", schedule.id);
      } else {
        const { data } = await supabase.from("agent_schedule_config").insert({ ...payload, agent_instructions: schedule.agent_instructions }).select("id").single();
        if (data) setSchedule(prev => ({ ...prev, id: (data as any).id }));
      }
      toast.success("Horários do agente salvos!");
    } catch {
      toast.error("Erro ao salvar horários");
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSaveInstructions = async () => {
    if (!org) return;
    setSavingInstructions(true);
    try {
      if (schedule.id) {
        await supabase.from("agent_schedule_config").update({
          agent_instructions: schedule.agent_instructions,
        }).eq("id", schedule.id);
      } else {
        const { data } = await supabase.from("agent_schedule_config").insert({
          org_id: org.id,
          agent_instructions: schedule.agent_instructions,
        }).select("id").single();
        if (data) setSchedule(prev => ({ ...prev, id: (data as any).id }));
      }
      toast.success("Instruções do agente salvas!");
    } catch {
      toast.error("Erro ao salvar instruções");
    } finally {
      setSavingInstructions(false);
    }
  };

  const handleRunAgent = async () => {
    if (!org) return;
    setRunningAgent(true);
    try {
      const { data, error } = await supabase.functions.invoke("prospection-agent-scheduler", {
        body: { manual: true, orgId: org.id },
      });
      if (error) throw error;
      toast.success(`Agente executado! ${data?.results?.[0]?.groups_checked || 0} grupos verificados, ${data?.results?.[0]?.messages_sent || 0} mensagens enviadas.`);
      // Refresh last execution
      const { data: execData } = await supabase.from("agent_execution_logs").select("*").eq("org_id", org.id).order("executed_at", { ascending: false }).limit(1).maybeSingle();
      if (execData) setLastExecution(execData);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao executar agente");
    } finally {
      setRunningAgent(false);
    }
  };

  if (!org || !user) return null;

  const hasEvolutionConfig = !!evolutionConfig;

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto animate-fade-in">
      <h1 className="text-xl font-bold text-foreground tracking-tight mb-6">Configurações</h1>

      <Tabs defaultValue="whatsapp" className="w-full">
        <TabsList className="w-full grid grid-cols-3 mb-6">
          <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
          <TabsTrigger value="agent">Agente IA</TabsTrigger>
          <TabsTrigger value="instructions">Instruções</TabsTrigger>
        </TabsList>

        {/* WhatsApp Tab */}
        <TabsContent value="whatsapp" className="space-y-4">
          {isAdmin && (
            <section className="rounded-lg border border-border bg-card p-4">
              <EvolutionApiConfig orgId={org.id} />
            </section>
          )}

          {isAdmin && (
            <section className="rounded-lg border border-border bg-card p-4">
              <WhatsAppInstancesManager
                orgId={org.id}
                instanceType="master"
                isAdmin={isAdmin}
                hasEvolutionConfig={hasEvolutionConfig}
              />
            </section>
          )}

          <section className="rounded-lg border border-border bg-card p-4">
            <WhatsAppInstancesManager
              orgId={org.id}
              instanceType="user"
              userId={user.id}
              isAdmin={isAdmin}
              hasEvolutionConfig={hasEvolutionConfig}
              canCloneInstance={members.find(m => m.user_id === user.id)?.can_clone_instance ?? false}
            />
          </section>
        </TabsContent>

        {/* Agent Schedule Tab */}
        <TabsContent value="agent" className="space-y-4">
          {/* Agent Status Card */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Status do Agente</h3>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-7"
                onClick={handleRunAgent}
                disabled={runningAgent}
              >
                {runningAgent ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Executar agora
              </Button>
            </div>
            {lastExecution ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Última execução</p>
                  <p className="text-xs font-medium text-foreground">
                    {new Date(lastExecution.executed_at).toLocaleDateString("pt-BR")} às {new Date(lastExecution.executed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Grupos verificados</p>
                  <p className="text-xs font-medium text-foreground">{lastExecution.groups_checked}</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Mensagens enviadas</p>
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-medium text-foreground">{lastExecution.messages_sent}</p>
                    {lastExecution.status === "success" ? (
                      <CheckCircle className="h-3 w-3 text-success" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 text-warning" />
                    )}
                  </div>
                </div>
                {lastExecution.error_log && (
                  <div className="col-span-3 rounded-lg bg-destructive/5 border border-destructive/10 p-2">
                    <p className="text-[10px] text-destructive">{lastExecution.error_log}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhuma execução registrada ainda.</p>
            )}
          </section>

          {/* Schedule config */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Horários do Agente</h3>
                <p className="text-[10px] text-muted-foreground">Configure quando o agente verifica os grupos</p>
              </div>
              <Switch
                checked={schedule.is_active}
                onCheckedChange={(checked) => setSchedule(prev => ({ ...prev, is_active: checked }))}
              />
            </div>

            {loadingConfig ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="mb-5">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Dias da semana</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS.map(day => (
                      <button
                        key={day.key}
                        onClick={() => setSchedule(prev => ({ ...prev, [day.key]: !prev[day.key as keyof ScheduleConfig] }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          schedule[day.key as keyof ScheduleConfig]
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2 block">Horários de checagem</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: "check_time_1", label: "1ª Checagem" },
                      { key: "check_time_2", label: "2ª Checagem" },
                      { key: "check_time_3", label: "3ª Checagem" },
                    ].map(time => (
                      <div key={time.key}>
                        <label className="text-[10px] text-muted-foreground mb-1 block">{time.label}</label>
                        <input
                          type="time"
                          value={schedule[time.key as keyof ScheduleConfig] as string}
                          onChange={(e) => setSchedule(prev => ({ ...prev, [time.key]: e.target.value }))}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Button size="sm" className="gap-1.5 text-xs" onClick={handleSaveSchedule} disabled={savingSchedule}>
                  {savingSchedule ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Salvar Horários
                </Button>
              </>
            )}
          </section>

          {/* Cron Job Config */}
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Configuração do Cron Job</h3>
            </div>
            <p className="text-[10px] text-muted-foreground mb-4">
              Configure um serviço externo como <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="text-primary underline">cron-job.org</a> para chamar o agente automaticamente.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">URL (POST)</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground break-all select-all">
                    {`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/prospection-agent-scheduler`}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/prospection-agent-scheduler`);
                      toast.success("URL copiada!");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Headers</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground break-all select-all">
                    {`Authorization: Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(`Authorization: Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`);
                      toast.success("Header copiado!");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Content-Type</label>
                <code className="block bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground">
                  application/json
                </code>
              </div>

              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Body</label>
                <code className="block bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground">
                  {`{ "manual": false }`}
                </code>
              </div>

              <div>
                <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Frequência sugerida</label>
                <code className="block bg-muted border border-border rounded-lg px-3 py-2 text-xs text-foreground">
                  */5 * * * * — a cada 5 minutos
                </code>
                <p className="text-[10px] text-muted-foreground mt-1">
                  O scheduler verifica internamente se é horário de execução. Fora dos horários configurados acima, ele retorna sem fazer nada.
                </p>
              </div>
            </div>
          </section>
        </TabsContent>

        {/* Agent Instructions Tab */}
        <TabsContent value="instructions" className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <Bot className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Instruções do Agente</h3>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Defina a personalidade e comportamento do agente. Ele usará essas instruções para decidir como e quando interagir nos grupos.
              </p>
            </div>

            {loadingConfig ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <textarea
                  value={schedule.agent_instructions}
                  onChange={(e) => setSchedule(prev => ({ ...prev, agent_instructions: e.target.value }))}
                  rows={10}
                  placeholder="Descreva como o agente deve se comportar..."
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none leading-relaxed"
                />
                <div className="flex items-center justify-between mt-3">
                  <button
                    onClick={() => setSchedule(prev => ({ ...prev, agent_instructions: DEFAULT_INSTRUCTIONS }))}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors underline"
                  >
                    Restaurar padrão
                  </button>
                  <Button size="sm" className="gap-1.5 text-xs" onClick={handleSaveInstructions} disabled={savingInstructions}>
                    {savingInstructions ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Salvar Instruções
                  </Button>
                </div>
              </>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
