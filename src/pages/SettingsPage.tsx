import { useState, useEffect } from "react";
import { Loader2, Save } from "lucide-react";
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

const DEFAULT_TEMPLATES = [
  { key: "ask_qualification", description: "Pergunta sobre agendamento de qualificação", text: "Pessoal, conseguiram agendar a qualificação?" },
  { key: "ask_qualification_result", description: "Pergunta sobre resultado da qualificação", text: "Como foi a qualificação hoje, deu tudo certo?" },
  { key: "ask_proposal_date", description: "Pergunta sobre data para apresentar proposta", text: "Já temos data para apresentar a proposta?" },
  { key: "ask_client_return", description: "Pergunta sobre retorno do cliente", text: "Pessoal, ainda sem retorno do cliente?" },
  { key: "ask_phone_call", description: "Sugestão de contato por ligação", text: "Tentamos contato também por ligação?" },
  { key: "followup_reinforcement", description: "Reforço de cobrança (24h sem resposta)", text: "Pessoal, passando aqui novamente. Alguma novidade sobre essa prospecção?" },
];

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
}

interface MessageTemplate {
  id?: string;
  template_key: string;
  template_text: string;
  description: string | null;
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
  });
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    if (!org) return;

    const fetchConfig = async () => {
      const [schedRes, templRes] = await Promise.all([
        supabase.from("agent_schedule_config").select("*").eq("org_id", org.id).maybeSingle(),
        supabase.from("agent_message_templates").select("*").eq("org_id", org.id),
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
        });
      }

      if (templRes.data && templRes.data.length > 0) {
        setTemplates(templRes.data.map((t: any) => ({
          id: t.id,
          template_key: t.template_key,
          template_text: t.template_text,
          description: t.description,
        })));
      } else {
        setTemplates(DEFAULT_TEMPLATES.map(t => ({
          template_key: t.key,
          template_text: t.text,
          description: t.description,
        })));
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
        const { data } = await supabase.from("agent_schedule_config").insert(payload).select("id").single();
        if (data) setSchedule(prev => ({ ...prev, id: (data as any).id }));
      }
      toast.success("Horários do agente salvos!");
    } catch {
      toast.error("Erro ao salvar horários");
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleSaveTemplates = async () => {
    if (!org) return;
    setSavingTemplates(true);
    try {
      for (const t of templates) {
        if (t.id) {
          await supabase.from("agent_message_templates").update({
            template_text: t.template_text,
          }).eq("id", t.id);
        } else {
          const { data } = await supabase.from("agent_message_templates").insert({
            org_id: org.id,
            template_key: t.template_key,
            template_text: t.template_text,
            description: t.description,
          }).select("id").single();
          if (data) t.id = (data as any).id;
        }
      }
      toast.success("Mensagens padrão salvas!");
    } catch {
      toast.error("Erro ao salvar mensagens");
    } finally {
      setSavingTemplates(false);
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
          <TabsTrigger value="templates">Mensagens</TabsTrigger>
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
                {/* Days */}
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

                {/* Times */}
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

        {/* Message Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground">Mensagens Padrão do Agente</h3>
              <p className="text-[10px] text-muted-foreground">Customize as mensagens que o agente dispara nos grupos</p>
            </div>

            {loadingConfig ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {templates.map((t, i) => (
                    <div key={t.template_key} className="space-y-1">
                      <label className="text-xs font-medium text-foreground">{t.description || t.template_key}</label>
                      <textarea
                        value={t.template_text}
                        onChange={(e) => {
                          const updated = [...templates];
                          updated[i] = { ...updated[i], template_text: e.target.value };
                          setTemplates(updated);
                        }}
                        rows={2}
                        className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                      />
                    </div>
                  ))}
                </div>

                <Button size="sm" className="gap-1.5 text-xs mt-4" onClick={handleSaveTemplates} disabled={savingTemplates}>
                  {savingTemplates ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Salvar Mensagens
                </Button>
              </>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
