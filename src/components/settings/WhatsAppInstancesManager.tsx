import { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, RefreshCw, Wifi, WifiOff, QrCode, Trash2, Smartphone, Loader2, Link2 } from 'lucide-react';
import { useWhatsAppInstances, WhatsAppInstance } from '@/hooks/useWhatsAppInstances';
import { AddInstanceDialog } from './AddInstanceDialog';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface WhatsAppInstancesManagerProps {
  orgId: string;
  instanceType: 'master' | 'user';
  userId?: string;
  isAdmin: boolean;
  hasEvolutionConfig: boolean;
  canCloneInstance?: boolean;
}

export function WhatsAppInstancesManager({ orgId, instanceType, userId, isAdmin, hasEvolutionConfig, canCloneInstance }: WhatsAppInstancesManagerProps) {
  const { instances, isLoading, refetch, deleteInstance } = useWhatsAppInstances(orgId);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [linkingMaster, setLinkingMaster] = useState(false);

  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrConnected, setQrConnected] = useState(false);
  const qrPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const instance = instances.find(i => {
    if (i.instance_type !== instanceType) return false;
    if (instanceType === 'user' && userId && i.user_id !== userId) return false;
    return true;
  }) ?? null;
  const masterInstance = instanceType === 'user' ? instances.find(i => i.instance_type === 'master') ?? null : null;

  const handleUseMasterInstance = async () => {
    if (!masterInstance || !user) return;
    setLinkingMaster(true);
    try {
      // Get master instance secrets from vault
      const { data: vaultApiUrl } = await supabase.functions.invoke('manage-vault-secrets', {
        body: { action: 'check', secret_name: `whatsapp_api_url_${masterInstance.id}`, org_id: orgId },
      });

      let apiUrl: string | undefined;
      let apiKey: string | undefined;

      // Fallback to old table if vault doesn't have them
      if (!vaultApiUrl?.exists) {
        const { data: secrets } = await supabase
          .from('whatsapp_instance_secrets')
          .select('api_url, api_key')
          .eq('instance_id', masterInstance.id)
          .single();
        apiUrl = secrets?.api_url;
        apiKey = secrets?.api_key;
      }

      const { data, error } = await supabase.functions.invoke('create-evolution-instance', {
        body: {
          org_id: orgId,
          instance_type: 'user',
          user_id: user.id,
          name: `${masterInstance.name} (Envio)`,
          instance_name: masterInstance.instance_name,
          use_existing: true,
          api_url: apiUrl,
          api_key: apiKey,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao vincular');
      toast.success('Instância mãe vinculada como envio!');
      await refetch();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao vincular instância');
    } finally {
      setLinkingMaster(false);
    }
  };

  const stopQrPolling = useCallback(() => {
    if (qrPollingRef.current) {
      clearInterval(qrPollingRef.current);
      qrPollingRef.current = null;
    }
  }, []);

  const fetchQrCode = useCallback(async (instanceId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('get-evolution-qrcode', {
        body: { instance_id: instanceId },
      });
      if (error) throw error;
      if (data?.connected) {
        setQrConnected(true);
        setQrCode(null);
        stopQrPolling();
        await refetch();
      } else if (data?.qr_code) {
        setQrCode(data.qr_code);
      }
    } catch (err) {
      console.warn('[QR polling] error:', err);
    }
  }, [refetch, stopQrPolling]);

  const openQrModal = useCallback(async () => {
    if (!instance) return;
    setShowQrModal(true);
    setQrCode(null);
    setQrConnected(false);
    setQrLoading(true);
    stopQrPolling();
    await fetchQrCode(instance.id);
    setQrLoading(false);
    qrPollingRef.current = setInterval(() => fetchQrCode(instance.id), 20000);
  }, [instance, fetchQrCode, stopQrPolling]);

  const closeQrModal = useCallback(() => {
    stopQrPolling();
    setShowQrModal(false);
    setQrCode(null);
    setQrConnected(false);
  }, [stopQrPolling]);

  useEffect(() => () => stopQrPolling(), [stopQrPolling]);

  const handleDelete = async () => {
    if (!instance) return;
    await deleteInstance.mutateAsync(instance.id);
    setShowDeleteDialog(false);
  };

  const canManage = instanceType === 'master' ? isAdmin : true;
  const title = instanceType === 'master' ? 'Instância de Coleta (Mãe)' : 'Minha Instância de Envio';
  const description = instanceType === 'master' ? 'Conexão principal para receber mensagens' : 'Instância pessoal para enviar respostas';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
            <Wifi className="w-3 h-3" /> Conectado
          </span>
        );
      case 'qr_required':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent/10 text-accent border border-accent/20">
            <QrCode className="w-3 h-3" /> QR Code
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border">
            <WifiOff className="w-3 h-3" /> Desconectado
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-[10px] text-muted-foreground mb-3">{description}</p>
        <div className="flex items-center justify-center p-4">
          <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-[10px] text-muted-foreground">{description}</p>
      </div>

      {!instance ? (
        <div className="text-center p-6 border border-dashed border-border rounded-md">
          <Smartphone className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground mb-3">Nenhuma instância configurada</p>
          <div className="flex flex-col items-center gap-1.5">
            {canManage && masterInstance && masterInstance.status === 'connected' && (isAdmin || canCloneInstance) && (
              <Button
                size="sm"
                onClick={handleUseMasterInstance}
                disabled={linkingMaster}
                className="gap-1 text-xs h-7"
              >
                {linkingMaster ? <Loader2 className="w-3 h-3 animate-spin" /> : <Link2 className="w-3 h-3" />}
                Usar instância mãe
              </Button>
            )}
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddDialogOpen(true)}
                disabled={!hasEvolutionConfig}
                className="text-xs h-7"
              >
                <Plus className="w-3 h-3 mr-1" /> Configurar instância
              </Button>
            )}
          </div>
          {!hasEvolutionConfig && canManage && (
            <p className="text-[10px] text-muted-foreground mt-2">Configure a Evolution API primeiro</p>
          )}
        </div>
      ) : (
        <div className="p-3 rounded-md border border-border bg-card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1.5 rounded-md bg-primary/10 shrink-0">
                <Smartphone className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="min-w-0">
                <span className="font-medium text-foreground text-xs block truncate">{instance.name}</span>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>{instance.instance_name}</span>
                  {instance.phone_number && <><span>·</span><span>{instance.phone_number}</span></>}
                </div>
              </div>
            </div>
            {getStatusBadge(instance.status)}
          </div>
          {canManage && (
            <div className="flex gap-1.5 mt-2.5 pt-2.5 border-t border-border">
              {instance.status !== 'connected' && (
                <Button variant="outline" size="sm" onClick={openQrModal} className="gap-1 text-xs h-7">
                  <QrCode className="w-3 h-3" /> QR Code
                </Button>
              )}
              <Button variant="outline" size="sm" className="gap-1 text-xs h-7 text-destructive hover:text-destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="w-3 h-3" /> Remover
              </Button>
            </div>
          )}
        </div>
      )}

      <AddInstanceDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        orgId={orgId}
        instanceType={instanceType}
        userId={userId}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover instância?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá <strong>{instance?.name}</strong> e desconectará da Evolution API.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showQrModal} onOpenChange={(open) => !open && closeQrModal()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">QR Code — {instance?.name}</DialogTitle>
          </DialogHeader>
          {qrConnected ? (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Wifi className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">Conectado!</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-48 h-48 rounded-lg border border-border bg-card flex items-center justify-center overflow-hidden">
                {qrLoading && !qrCode ? (
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                ) : qrCode ? (
                  <img
                    src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                    alt="QR Code"
                    className="w-full h-full object-contain p-2"
                  />
                ) : (
                  <QrCode className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" /> Aguardando conexão...
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
