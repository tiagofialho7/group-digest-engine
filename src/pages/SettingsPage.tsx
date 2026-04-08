import { useState, useEffect } from "react";
import { Loader2, Save, Bot } from "lucide-react";
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

const DEFAULT_INSTRUCTIONS = `Você é Tiago, analista comercial da PWR Gestão. Seu papel é acompanhar grupos internos de prospecção e cobrar o avanço no funil comercial de forma direta e natural, como um humano faria. Seja incisivo mas não formal. Leia o contexto da conversa antes de agir — se o consultor disse que ia ligar na segunda, pergunte se ligou. Se o prospecto ficou de dar retorno numa data, pergunte se deu. Nunca mande mensagem genérica — sempre contextualize com o que foi dito no grupo. Se o grupo está avançando normalmente, não interfira.`;

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

  useEffect(() => {
    if (!org) return;

    const fetchConfig = async () => {
      const { data } = await supabase.from("agent_schedule_config").select("*").eq("org_id", org.id).maybeSingle();

      if (data) {
        const d = data as any;
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
