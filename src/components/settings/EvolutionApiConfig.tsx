import { useState } from 'react';
import { Wifi, Loader2, Trash2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useEvolutionConfig } from '@/hooks/useEvolutionConfig';
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

interface EvolutionApiConfigProps {
  orgId: string;
}

export function EvolutionApiConfig({ orgId }: EvolutionApiConfigProps) {
  const { config, isLoading, saveConfig, deleteConfig } = useEvolutionConfig(orgId);
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const cleanEvolutionUrl = (url: string) => {
    try {
      const parsed = new URL(url.trim());
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return url.trim().replace(/\/+$/, '');
    }
  };

  const startEditing = () => {
    setApiUrl(config?.api_url || '');
    setApiKey(''); // Don't load vault key - user must re-enter
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!apiUrl.trim() || !apiKey.trim()) return;
    const cleanUrl = cleanEvolutionUrl(apiUrl);
    setApiUrl(cleanUrl);
    await saveConfig.mutateAsync({ apiUrl: cleanUrl, apiKey: apiKey.trim() });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteConfig.mutateAsync();
    setShowDeleteDialog(false);
    setIsEditing(false);
    setApiUrl('');
    setApiKey('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (config && !isEditing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Evolution API</h3>
            <p className="text-[10px] text-muted-foreground">Servidor compartilhado por todas as instâncias</p>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
            <CheckCircle className="w-3 h-3" /> Conectado
          </span>
        </div>
        <div className="bg-muted/50 rounded-md px-3 py-2 mb-3">
          <p className="text-[10px] text-muted-foreground">URL</p>
          <p className="text-xs font-medium text-foreground truncate">{config.api_url}</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={startEditing} className="text-xs h-7">Editar</Button>
          <Button variant="outline" size="sm" className="text-xs h-7 text-destructive hover:text-destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-3 h-3 mr-1" /> Desconectar
          </Button>
        </div>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desconectar Evolution API?</AlertDialogTitle>
              <AlertDialogDescription>
                As credenciais serão removidas. Instâncias existentes ficarão sem conexão.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Desconectar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">Evolution API</h3>
        <p className="text-[10px] text-muted-foreground">
          {config ? 'Atualize as credenciais' : 'Configure o servidor para conectar instâncias WhatsApp'}
        </p>
      </div>
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-xs">URL do Servidor</Label>
          <Input placeholder="https://evolution-api.exemplo.com" value={apiUrl} onChange={e => setApiUrl(e.target.value)} onBlur={() => { if (apiUrl.trim()) setApiUrl(cleanEvolutionUrl(apiUrl)); }} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">API Key</Label>
          <Input type="password" placeholder="••••••••" value={apiKey} onChange={e => setApiKey(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="flex gap-1.5 pt-1">
          <Button size="sm" onClick={handleSave} disabled={saveConfig.isPending || !apiUrl.trim() || !apiKey.trim()} className="gap-1 text-xs h-7">
            {saveConfig.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wifi className="w-3 h-3" />}
            Testar e Salvar
          </Button>
          {isEditing && (
            <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)} className="text-xs h-7">Cancelar</Button>
          )}
        </div>
      </div>
    </div>
  );
}
