import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Camera, Loader2, Check, User, Image, Send } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
// @ts-ignore
import confetti from "canvas-confetti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useOrganization } from "@/hooks/useOrganization";
import { useAuth } from "@/hooks/useAuth";
import { useMemberSetupStatus } from "@/hooks/useMemberSetupStatus";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StepSendingInstance } from "./StepSendingInstance";

interface MemberSetupWizardProps {
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
  { id: "name", label: "Nome", icon: User },
  { id: "avatar", label: "Foto", icon: Image },
  { id: "sending", label: "Envio", icon: Send },
];

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

// Step 1: Name
function StepName({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.full_name) {
          setFullName(data.full_name);
          setSaved(true);
        }
      });
  }, [user]);

  const handleSave = async () => {
    if (!user || !fullName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("user_id", user.id);
      if (error) throw error;
      setSaved(true);
      toast.success("Nome salvo!");
      onSaved();
    } catch {
      toast.error("Erro ao salvar nome");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <motion.div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"
          whileHover={{ scale: 1.05, rotate: 5 }}
        >
          <User className="w-8 h-8 text-primary" />
        </motion.div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Seu nome</h3>
        <p className="text-muted-foreground text-sm">Como você quer ser identificado na plataforma?</p>
      </div>
      <div className="max-w-sm mx-auto space-y-4">
        <Input
          placeholder="Seu nome completo"
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); setSaved(false); }}
          className="h-10 text-sm"
        />
        <Button onClick={handleSave} disabled={!fullName.trim() || saving || saved} className="w-full gap-2">
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          ) : saved ? (
            <><Check className="w-4 h-4" /> Salvo</>
          ) : (
            <><Check className="w-4 h-4" /> Salvar nome</>
          )}
        </Button>
      </div>
    </div>
  );
}

// Step 2: Avatar
function StepAvatar({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("avatar_url, full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setAvatarUrl(data?.avatar_url || null);
        setFullName(data?.full_name || "");
      });
  }, [user]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 2MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const filePath = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-pictures")
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from("profile-pictures")
        .getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("user_id", user.id);
      setAvatarUrl(publicUrl);
      toast.success("Foto atualizada!");
      onSaved();
    } catch (err: any) {
      toast.error("Erro ao enviar foto");
    } finally {
      setUploading(false);
    }
  };

  const initials = fullName
    ? fullName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || "?";

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <motion.div
          className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center"
          whileHover={{ scale: 1.05, rotate: 5 }}
        >
          <Image className="w-8 h-8 text-primary" />
        </motion.div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Foto de perfil</h3>
        <p className="text-muted-foreground text-sm">Adicione uma foto para os outros membros te reconhecerem.</p>
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className="relative group">
          <Avatar className="h-28 w-28">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="Avatar" />}
            <AvatarFallback className="bg-primary/10 text-primary text-3xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 text-white animate-spin" />
            ) : (
              <Camera className="h-6 w-6 text-white" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="gap-2">
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
          ) : avatarUrl ? (
            <><Camera className="w-4 h-4" /> Trocar foto</>
          ) : (
            <><Camera className="w-4 h-4" /> Enviar foto</>
          )}
        </Button>
      </div>
    </div>
  );
}

export function MemberSetupWizard({ isOpen, onClose }: MemberSetupWizardProps) {
  const { org, members } = useOrganization();
  const { user } = useAuth();
  const { refetch: refetchSteps } = useMemberSetupStatus();
  const [activeStep, setActiveStep] = useState(0);
  const [direction, setDirection] = useState(0);

  const canCloneInstance = members.find(m => m.user_id === user?.id)?.can_clone_instance ?? false;

  useEffect(() => {
    if (isOpen) setActiveStep(0);
  }, [isOpen]);

  const goTo = (step: number) => {
    if (step < 0 || step >= WIZARD_STEPS.length) return;
    setDirection(step > activeStep ? 1 : -1);
    setActiveStep(step);
  };

  const handleComplete = () => {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    refetchSteps();
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
        <motion.div
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        <motion.div
          className="relative w-full max-w-xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 30 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
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
                {activeStep === 0 && <StepName onSaved={() => refetchSteps()} />}
                {activeStep === 1 && <StepAvatar onSaved={() => refetchSteps()} />}
                {activeStep === 2 && <StepSendingInstance canCloneInstance={canCloneInstance} onInstanceConnected={() => { refetchSteps(); handleComplete(); }} />}
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
              {!isLastStep && (
                <Button size="sm" onClick={() => goTo(activeStep + 1)} className="gap-1.5 text-xs">
                  Próximo <ChevronRight className="w-4 h-4" />
                </Button>
              )}
              {isLastStep && (
                <Button size="sm" onClick={handleComplete} className="gap-1.5 text-xs">
                  Concluir <Check className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
