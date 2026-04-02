import { CheckCircle, Circle, Rocket, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { SetupStep } from "@/hooks/useSetupStatus";

interface StepFinishProps {
  steps: SetupStep[];
  onComplete: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.1 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 300, damping: 24 } },
};

export function StepFinish({ steps, onComplete }: StepFinishProps) {
  const completedSteps = steps.filter((s) => s.isComplete);
  const allDone = completedSteps.length === steps.length;

  return (
    <motion.div className="space-y-8" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants} className="text-center mb-8">
        <motion.div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"
          whileHover={{ scale: 1.05, rotate: 5 }}
        >
          <Rocket className="w-8 h-8 text-primary" />
        </motion.div>
        <h3 className="text-xl font-semibold text-foreground mb-2">
          {allDone ? "Tudo pronto! 🎉" : "Resumo da Configuração"}
        </h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          {allDone
            ? "Todas as integrações foram configuradas com sucesso."
            : "Revise o status das configurações abaixo."}
        </p>
      </motion.div>

      <div className="max-w-sm mx-auto space-y-3">
        {steps.map((step, idx) => (
          <motion.div
            key={step.id}
            variants={itemVariants}
            className={`flex items-center gap-3 p-3 rounded-lg border ${
              step.isComplete
                ? "bg-primary/5 border-primary/20"
                : step.isRequired
                ? "bg-destructive/5 border-destructive/20"
                : "bg-muted/30 border-border"
            }`}
          >
            {step.isComplete ? (
              <CheckCircle className="w-5 h-5 text-primary shrink-0" />
            ) : step.isRequired ? (
              <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
            ) : (
              <Circle className="w-5 h-5 text-muted-foreground shrink-0" />
            )}
            <span className="text-sm font-medium text-foreground">{step.title}</span>
            <span
              className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full ${
                step.isComplete
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step.isComplete ? "Configurado" : "Pendente"}
            </span>
          </motion.div>
        ))}
      </div>

      <motion.div variants={itemVariants} className="max-w-sm mx-auto pt-4">
        <Button onClick={onComplete} className="w-full gap-2">
          <Rocket className="w-4 h-4" />
          {allDone ? "Começar a Usar" : "Fechar e Configurar Depois"}
        </Button>
      </motion.div>
    </motion.div>
  );
}
