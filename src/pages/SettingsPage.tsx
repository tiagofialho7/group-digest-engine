import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { useEvolutionConfig } from "@/hooks/useEvolutionConfig";
import { toast } from "sonner";
import { EvolutionApiConfig } from "@/components/settings/EvolutionApiConfig";
import { WhatsAppInstancesManager } from "@/components/settings/WhatsAppInstancesManager";
import { AnthropicConfig } from "@/components/settings/AnthropicConfig";
import { ResendConfig } from "@/components/settings/ResendConfig";

export default function SettingsPage() {
  const { user } = useAuth();
  const { org, members, isAdmin, refetch } = useOrganization();
  const { config: evolutionConfig } = useEvolutionConfig(org?.id);

  const [rules, setRules] = useState<{ id: string; rule_text: string }[]>([]);
  const [newRule, setNewRule] = useState("");
  const [orgName, setOrgName] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [registrationSettingsId, setRegistrationSettingsId] = useState<string | null>(null);
  const [updatingRegistration, setUpdatingRegistration] = useState(false);

  useEffect(() => {
    if (!org || !user) return;
    setOrgName(org.name);

    const fetchRules = async () => {
      const { data: rulesData } = await supabase
        .from("analysis_rules")
        .select("id, rule_text")
        .eq("org_id", org.id)
        .is("group_id", null);
      if (rulesData) setRules(rulesData);
    };
    fetchRules();
  }, [org, user]);

  useEffect(() => {
    const fetchRegistrationSetting = async () => {
      const { data } = await supabase
        .from('system_settings' as any)
        .select('id, registration_enabled')
        .limit(1)
        .single();
      if (data) {
        setRegistrationSettingsId((data as any).id);
        setRegistrationEnabled((data as any).registration_enabled);
      }
    };
    fetchRegistrationSetting();
  }, []);

  const handleRegistrationToggle = async (checked: boolean) => {
    setUpdatingRegistration(true);
    let error;
    if (registrationSettingsId) {
      const result = await supabase
        .from('system_settings' as any)
        .update({ registration_enabled: checked } as any)
        .eq('id', registrationSettingsId);
      error = result.error;
    } else {
      const result = await supabase
        .from('system_settings' as any)
        .insert({ registration_enabled: checked } as any)
        .select('id')
        .single();
      error = result.error;
      if (!error && result.data) {
        setRegistrationSettingsId((result.data as any).id);
      }
    }
    if (error) {
      toast.error('Erro ao atualizar configuração');
    } else {
      setRegistrationEnabled(checked);
      toast.success(checked ? 'Registro habilitado' : 'Registro desabilitado');
    }
    setUpdatingRegistration(false);
  };

  const addRule = async () => {
    if (!newRule.trim() || !org) return;
    const { data, error } = await supabase
      .from("analysis_rules")
      .insert({ org_id: org.id, rule_text: newRule.trim() })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    if (data) setRules([...rules, data]);
    setNewRule("");
  };

  const deleteRule = async (id: string) => {
    await supabase.from("analysis_rules").delete().eq("id", id);
    setRules(rules.filter((r) => r.id !== id));
  };

  const saveOrgName = async () => {
    if (!org) return;
    const { error } = await supabase.from("organizations").update({ name: orgName.trim() }).eq("id", org.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Nome atualizado!");
      refetch();
    }
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !org) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2MB");
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${org.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("org-logos")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("org-logos")
        .getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from("organizations")
        .update({ logo_url: publicUrl } as any)
        .eq("id", org.id);
      if (updateError) throw updateError;

      toast.success("Logo atualizada!");
      refetch();
      e.target.value = "";
    } catch (err: any) {
      toast.error("Erro ao enviar logo: " + (err.message || "Tente novamente"));
    } finally {
      setUploadingLogo(false);
    }
  };

  if (!org || !user) return null;

  const hasEvolutionConfig = !!evolutionConfig;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground tracking-tight mb-6">Configurações</h1>

      {/* Registration Toggle - visible to all authenticated users */}
      <div className="rounded-lg border border-border p-4 mb-6 flex items-center justify-between">
        <div className="space-y-0.5">
          <h2 className="text-sm font-semibold text-foreground">Registro de novos usuários</h2>
          <p className="text-[10px] text-muted-foreground">Habilitar ou desabilitar o cadastro de novos usuários na plataforma.</p>
        </div>
        <Switch
          checked={registrationEnabled}
          onCheckedChange={handleRegistrationToggle}
          disabled={updatingRegistration}
        />
      </div>

      <Tabs defaultValue="keys" className="w-full">
        <TabsList className="w-full grid grid-cols-3 mb-6">
          <TabsTrigger value="keys">Integrações</TabsTrigger>
          <TabsTrigger value="context">Contexto Global</TabsTrigger>
          <TabsTrigger value="org">Organização</TabsTrigger>
        </TabsList>

        <TabsContent value="keys" className="space-y-4">
          {isAdmin && (
            <section className="rounded-lg border border-border p-4">
              <EvolutionApiConfig orgId={org.id} />
            </section>
          )}

          {isAdmin && (
            <section className="rounded-lg border border-border p-4">
              <WhatsAppInstancesManager
                orgId={org.id}
                instanceType="master"
                isAdmin={isAdmin}
                hasEvolutionConfig={hasEvolutionConfig}
              />
            </section>
          )}

          <section className="rounded-lg border border-border p-4">
            <WhatsAppInstancesManager
              orgId={org.id}
              instanceType="user"
              userId={user.id}
              isAdmin={isAdmin}
              hasEvolutionConfig={hasEvolutionConfig}
              canCloneInstance={members.find(m => m.user_id === user.id)?.can_clone_instance ?? false}
            />
          </section>

          <section className="rounded-lg border border-border p-4">
            <AnthropicConfig orgId={org.id} isAdmin={isAdmin} />
          </section>

          {isAdmin && (
            <section className="rounded-lg border border-border p-4">
              <ResendConfig orgId={org.id} isAdmin={isAdmin} />
            </section>
          )}
        </TabsContent>

        <TabsContent value="context" className="space-y-4">
          <section className="rounded-lg border border-border p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-foreground">Regras de Análise (Globais)</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Aplicadas a todos os grupos. Regras por grupo são configuradas na análise.</p>
            </div>
            <div className="space-y-1.5 mb-3">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
                  <span className="flex-1 text-xs text-foreground">{rule.rule_text}</span>
                  {isAdmin && (
                    <button onClick={() => deleteRule(rule.id)} className="text-muted-foreground/50 hover:text-destructive transition-colors">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {rules.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma regra adicionada.</p>}
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <input
                  value={newRule}
                  onChange={(e) => setNewRule(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRule()}
                  placeholder="Adicionar nova regra..."
                  className="flex-1 bg-muted border border-border rounded-md px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button onClick={addRule} size="sm" variant="outline" className="gap-1 text-xs h-7">
                  <Plus className="h-3 w-3" /> Adicionar
                </Button>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="org" className="space-y-4">
          {isAdmin ? (
            <section className="rounded-lg border border-border p-4">
              <h2 className="text-sm font-semibold text-foreground mb-4">Organização</h2>
              
              {/* Logo upload */}
              <div className="mb-5">
                <label className="text-[10px] font-medium text-muted-foreground mb-2 block uppercase tracking-wide">Logo</label>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <Avatar className="h-16 w-16 rounded-lg">
                      {(org as any).logo_url && <AvatarImage src={(org as any).logo_url} alt="Logo da organização" className="object-cover" />}
                      <AvatarFallback className="bg-primary/10 text-primary text-lg font-semibold rounded-lg">
                        {(org.name || "?").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <button
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="absolute inset-0 rounded-lg bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    >
                      {uploadingLogo ? (
                        <Loader2 className="h-5 w-5 text-white animate-spin" />
                      ) : (
                        <Camera className="h-5 w-5 text-white" />
                      )}
                    </button>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleUploadLogo}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Clique para alterar a logo.<br />Máximo 2MB.</p>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-medium text-muted-foreground mb-1 block uppercase tracking-wide">Nome</label>
                <div className="flex gap-2">
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="flex-1 bg-muted border border-border rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <Button onClick={saveOrgName} size="sm" variant="outline" className="text-xs h-8">Salvar</Button>
                </div>
              </div>
            </section>
          ) : (
            <section className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground">Apenas administradores podem editar as configurações da organização.</p>
            </section>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
