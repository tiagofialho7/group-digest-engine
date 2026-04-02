import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import logo from "@/assets/logo.png";
import { useOrganization } from "@/hooks/useOrganization";
import { toast } from "sonner";

export default function OnboardingPage() {
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const { createOrg } = useOrganization();
  const navigate = useNavigate();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) return;
    setLoading(true);
    try {
      await createOrg(orgName.trim());
      toast.success("Organização criada!");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar organização");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-slide-up">
         <div className="flex items-center gap-3 justify-center mb-8">
           <img src={logo} alt="VIA Logo" className="h-10 w-auto" />
           <span className="text-2xl font-bold text-foreground tracking-tight">GroupLens</span>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <h2 className="text-lg font-semibold text-foreground mb-1">Bem-vindo!</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Crie sua organização para começar a monitorar grupos.
          </p>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da Organização</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
                placeholder="Ex: Minha Mentoria"
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Button type="submit" className="w-full gap-2" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Organização
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
