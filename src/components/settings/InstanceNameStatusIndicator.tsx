import React from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { InstanceNameStatus } from '@/hooks/useInstanceNameCheck';

interface Props {
  status: InstanceNameStatus;
}

export const InstanceNameStatusIndicator = React.forwardRef<HTMLDivElement, Props>(
  ({ status }, ref) => {
    if (status === 'idle') return null;

    return (
      <div ref={ref} className="flex items-center gap-1.5 mt-1">
        {status === 'checking' && (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Verificando disponibilidade...</span>
          </>
        )}
        {status === 'available' && (
          <>
            <CheckCircle className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-primary">Nome disponível</span>
          </>
        )}
        {status === 'taken' && (
          <>
            <XCircle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-xs text-destructive">Nome já em uso</span>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Erro ao verificar</span>
          </>
        )}
      </div>
    );
  }
);

InstanceNameStatusIndicator.displayName = 'InstanceNameStatusIndicator';
