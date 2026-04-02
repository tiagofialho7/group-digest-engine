import { Rocket, CheckCircle, Circle, AlertCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSetupStatus } from "@/hooks/useSetupStatus";

interface SetupBannerProps {
  onOpenWizard: () => void;
}

export function SetupBanner({ onOpenWizard }: SetupBannerProps) {
  const { loading, isComplete, steps, completionPercentage } = useSetupStatus();

  if (loading || isComplete) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-primary/5 p-5 mb-6">
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
                <Rocket className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Complete a configuração</h3>
                <p className="text-xs text-muted-foreground">Configure as integrações para começar a usar</p>
              </div>
            </div>

            {/* Progress */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                <span>Progresso</span>
                <span className="text-primary font-medium">{completionPercentage}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>

            {/* Steps */}
            <div className="flex flex-wrap gap-2">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                    step.isComplete
                      ? "bg-primary/10 text-primary border-primary/20"
                      : step.isRequired
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                      : "bg-muted text-muted-foreground border-border"
                  }`}
                >
                  {step.isComplete ? <CheckCircle className="w-2.5 h-2.5" /> : step.isRequired ? <AlertCircle className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
                  {step.title}
                </div>
              ))}
            </div>
          </div>

          <div className="flex-shrink-0">
            <Button size="sm" onClick={onOpenWizard} className="gap-1.5 text-xs">
              Configurar <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
