import React, { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, QrCode, RefreshCw, ArrowRight, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface AddInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  instanceType: 'master' | 'user';
  userId?: string;
}

type Step = 'name' | 'creating' | 'qrcode' | 'connected';

export function AddInstanceDialog({ open, onOpenChange, orgId, instanceType, userId }: AddInstanceDialogProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [instanceId, setInstanceId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isFetchingQr, setIsFetchingQr] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleNameChange = (val: string) => {
    setName(val);
    setInstanceName(val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''));
    // Clear previous name-taken error when user types
    setErrors(prev => {
      const { instanceName: _, ...rest } = prev;
      return rest;
    });
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Nome obrigatório';
    if (!instanceName.trim()) errs.instanceName = 'Nome da instância obrigatório';
    if (!/^[a-zA-Z0-9_-]+$/.test(instanceName)) errs.instanceName = 'Apenas letras, números, _ e -';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const checkNameAvailability = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('check-instance-name', {
        body: { instance_name: instanceName, org_id: orgId },
      });
      if (error) {
        toast.error('Erro ao verificar disponibilidade do nome');
        return false;
      }
      if (!data?.available) {
        setErrors(prev => ({ ...prev, instanceName: 'Este nome de instância já está em uso' }));
        return false;
      }
      return true;
    } catch {
      toast.error('Erro ao verificar disponibilidade do nome');
      return false;
    }
  };

  const handleCreate = async () => {
    if (!validate()) return;

    setIsCreating(true);

    // Check name availability before creating
    const available = await checkNameAvailability();
    if (!available) {
      setIsCreating(false);
      return;
    }

    setStep('creating');
    try {
      const { data, error } = await supabase.functions.invoke('create-evolution-instance', {
        body: {
          instance_name: instanceName,
          name,
          org_id: orgId,
          instance_type: instanceType,
          user_id: instanceType === 'user' ? userId : null,
        },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Erro ao criar instância');

      setInstanceId(data.instance_id);
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

      if (data.qr_code) {
        setQrCode(data.qr_code);
        setStep('qrcode');
        startPolling(data.instance_id);
      } else {
        setStep('qrcode');
        await fetchQr(data.instance_id);
        startPolling(data.instance_id);
      }
    } catch (err: any) {
      toast.error(err.message);
      setStep('name');
    } finally {
      setIsCreating(false);
    }
  };

  const fetchQr = async (id: string) => {
    setIsFetchingQr(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-evolution-qrcode', {
        body: { instance_id: id },
      });
      if (error) throw error;
      if (data?.connected) {
        setQrCode(null);
        setStep('connected');
        stopPolling();
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
        return;
      }
      if (data?.qr_code) setQrCode(data.qr_code);
    } catch (err) {
      console.error('Error fetching QR:', err);
    } finally {
      setIsFetchingQr(false);
    }
  };

  const startPolling = (id: string) => {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      const { data } = await supabase.functions.invoke('get-evolution-qrcode', {
        body: { instance_id: id },
      });
      if (data?.connected) {
        setQrCode(null);
        setStep('connected');
        stopPolling();
        queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      } else if (data?.qr_code) {
        setQrCode(data.qr_code);
      }
    }, 5000);
  };

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const handleClose = () => {
    stopPolling();
    setStep('name');
    setName('');
    setInstanceName('');
    setErrors({});
    setInstanceId(null);
    setQrCode(null);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) stopPolling();
    return () => stopPolling();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {instanceType === 'master' ? 'Configurar Instância de Coleta' : 'Configurar Instância de Envio'}
          </DialogTitle>
          <DialogDescription>
            {instanceType === 'master' ? 'Instância principal para receber mensagens dos grupos' : 'Sua instância pessoal para enviar respostas'}
          </DialogDescription>
        </DialogHeader>

        {step === 'name' && (
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome da Conexão</Label>
              <Input placeholder="Ex: WhatsApp Vendas" value={name} onChange={e => handleNameChange(e.target.value)} />
              {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Nome da Instância <span className="text-muted-foreground font-normal text-xs">(slug)</span></Label>
              <Input placeholder="Ex: vendas-main" value={instanceName} onChange={e => {
                setInstanceName(e.target.value);
                setErrors(prev => {
                  const { instanceName: _, ...rest } = prev;
                  return rest;
                });
              }} />
              {errors.instanceName && <p className="text-xs text-destructive">{errors.instanceName}</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={handleClose}>Cancelar</Button>
              <Button onClick={handleCreate} className="gap-2" disabled={isCreating}>
                {isCreating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Verificando...</>
                ) : (
                  <>Criar e Conectar <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 'creating' && (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <div className="text-center">
              <p className="font-medium text-foreground">Criando instância...</p>
              <p className="text-sm text-muted-foreground mt-1">Conectando à Evolution API e gerando QR Code</p>
            </div>
          </div>
        )}

        {step === 'qrcode' && (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="text-center">
              <p className="font-medium text-foreground">Escaneie o QR Code</p>
              <p className="text-sm text-muted-foreground">WhatsApp → Menu → Aparelhos Conectados → Conectar</p>
            </div>
            <div className="w-56 h-56 rounded-xl border-2 border-primary/20 bg-card flex items-center justify-center overflow-hidden">
              {isFetchingQr && !qrCode ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <span className="text-xs">Gerando QR...</span>
                </div>
              ) : qrCode ? (
                <img
                  src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                  alt="QR Code WhatsApp"
                  className="w-full h-full object-contain p-2"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <QrCode className="w-10 h-10" />
                  <span className="text-xs">QR não disponível</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="w-3 h-3 animate-spin" /> Aguardando conexão...
            </div>
            <div className="flex gap-2 w-full">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => instanceId && fetchQr(instanceId)} disabled={isFetchingQr}>
                <RefreshCw className={`w-4 h-4 ${isFetchingQr ? 'animate-spin' : ''}`} /> Atualizar QR
              </Button>
              <Button variant="ghost" className="flex-1" onClick={handleClose}>Fechar</Button>
            </div>
          </div>
        )}

        {step === 'connected' && (
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-primary/20">
              <CheckCircle className="w-10 h-10 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground text-lg">WhatsApp Conectado!</p>
              <p className="text-sm text-muted-foreground mt-1">
                A instância <strong>{name}</strong> está ativa e pronta.
              </p>
            </div>
            <Button onClick={handleClose} className="gap-2 mt-2">
              <Smartphone className="w-4 h-4" /> Concluir
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
