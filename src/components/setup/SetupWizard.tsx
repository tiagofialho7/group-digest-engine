import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, SkipForward } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
// @ts-ignore
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/hooks/useOrganization";
import { useEvolutionConfig } from "@/hooks/useEvolutionConfig";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import { StepEvolutionApi } from "./StepEvolutionApi";
import { StepWhatsAppConnect } from "./StepWhatsAppConnect";
import { StepSendingInstance } from "./StepSendingInstance";
import { StepAnthropicKey } from "./StepAnthropicKey";
import { StepAnalysisRules } from "./StepAnalysisRules";
import { StepFinish } from "./StepFinish";

interface SetupWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
    scale: 0.95,
    filter: "blur(8px)",
  }),
  center: { x: 0, opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
    scale: 0.95,
    filter: "blur(8px)",
  }),
};

const WIZARD_STEPS = [
  { id: "evolution", label: "Evolution API" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "sending", label: "Envio" },
  { id: "analysis_rules", label: "Regras de Análise" },
  { id: "anthropic", label: "Anthropic" },
  { id: "finish", label: "Finalizar" },
];

// Animated checkmark
const AnimatedCheckmark = () => (
  <motion.svg viewBox="0 0 24 24" className="w-4 h-4" initial="hidden" animate="visible">
    <motion.path
      d="M5 13l4 4L19 7"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      variants={{
        hidden: { pathLength: 0, opacity: 0 },
        visible: { pathLength: 1, opacity: 1, transition: { pathLength: { duration: 0.4 }, opacity: { duration: 0.1 } } },
      }}
    />
  </motion.svg>
);

const StepCircle = ({ index, activeStep, onClick }: { index: number; activeStep: number; onClick: () => void }) => {
  const isCompleted = index < activeStep;
  const isActive = index === activeStep;

  return (
    <motion.button onClick={onClick} className="relative z-10 flex-shrink-0" whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.95 }}>
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-full bg-primary/30"
          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ margin: "-4px" }}
        />
      )}
      <motion.div
        className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors duration-300 ${
          isCompleted
            ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/40"
            : isActive
            ? "border-primary text-primary bg-primary/10 shadow-lg shadow-primary/20"
            : "border-border text-muted-foreground bg-muted/50"
        }`}
      >
        {isCompleted ? <AnimatedCheckmark /> : <span className="text-xs font-semibold">{index + 1}</span>}
      </motion.div>
    </motion.button>
  );
};

const ConnectingLine = ({ isCompleted }: { isCompleted: boolean }) => (
  <div className="relative flex-1 h-0.5 mx-1 bg-border rounded-full overflow-hidden self-center min-w-[12px]">
    <motion.div
      className="absolute inset-0 bg-primary"
      initial={{ scaleX: 0 }}
      animate={{ scaleX: isCompleted ? 1 : 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{ transformOrigin: "left" }}
    />
  </div>
);

export function SetupWizard({ isOpen, onClose }: SetupWizardProps) {
  const { org } = useOrganization();
  const { config: evoConfig } = useEvolutionConfig(org?.id);
  const { steps, refetch: refetchSteps } = useSetupStatus();
  const [activeStep, setActiveStep] = useState(0);
  const [direction, setDirection] = useState(0);

  // Form state
  const [evoUrl, setEvoUrl] = useState("");
  const [evoKey, setEvoKey] = useState("");

  // Load existing evo config
  useEffect(() => {
    if (evoConfig) {
      setEvoUrl(evoConfig.api_url || "");
      setEvoKey(evoConfig.api_key || "");
    }
  }, [evoConfig]);

  useEffect(() => {
    if (isOpen) setActiveStep(0);
  }, [isOpen]);

  const goTo = (step: number) => {
    if (step < 0 || step >= WIZARD_STEPS.length) return;
    setDirection(step > activeStep ? 1 : -1);
    setActiveStep(step);
    // Refetch steps when navigating to finish step
    if (step === WIZARD_STEPS.length - 1) {
      refetchSteps();
    }
  };

  const handleComplete = () => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    setTimeout(onClose, 800);
  };

  if (!isOpen || !org) return null;

  const isLastStep = activeStep === WIZARD_STEPS.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Step indicator */}
          <div className="px-8 pt-6 pb-2">
            <div className="flex items-center justify-center">
              {WIZARD_STEPS.map((step, idx) => (
                <div key={step.id} className="flex items-center">
                  <StepCircle index={idx} activeStep={activeStep} onClick={() => goTo(idx)} />
                  {idx < WIZARD_STEPS.length - 1 && <ConnectingLine isCompleted={idx < activeStep} />}
                </div>
              ))}
            </div>
          </div>

          {/* Step content */}
          <div className="px-8 py-6 min-h-[400px] overflow-y-auto max-h-[65vh]">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={activeStep}
                custom={direction}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                {activeStep === 0 && (
                  <StepEvolutionApi
                    apiUrl={evoUrl}
                    apiKey={evoKey}
                    onApiUrlChange={setEvoUrl}
                    onApiKeyChange={setEvoKey}
                    orgId={org.id}
                  />
                )}
                {activeStep === 1 && (
                  <StepWhatsAppConnect
                    evolutionApiUrl={evoUrl}
                    evolutionApiKey={evoKey}
                  />
                )}
                {activeStep === 2 && <StepSendingInstance />}
                {activeStep === 3 && <StepAnalysisRules orgId={org.id} />}
                {activeStep === 4 && <StepAnthropicKey orgId={org.id} />}
                {activeStep === 5 && <StepFinish steps={steps} onComplete={handleComplete} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation */}
          <div className="px-8 py-4 border-t border-border flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goTo(activeStep - 1)}
              disabled={activeStep === 0}
              className="gap-1.5 text-xs"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </Button>

            <div className="flex gap-2">
              {!isLastStep && (activeStep === 2 || activeStep === 3 || activeStep === 4) && (
                <Button variant="ghost" size="sm" onClick={() => goTo(activeStep + 1)} className="gap-1.5 text-xs text-muted-foreground">
                  <SkipForward className="w-3.5 h-3.5" /> Pular
                </Button>
              )}
              {!isLastStep && (
                <Button size="sm" onClick={() => goTo(activeStep + 1)} className="gap-1.5 text-xs">
                  Próximo <ChevronRight className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
