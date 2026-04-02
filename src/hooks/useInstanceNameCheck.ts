import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type InstanceNameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'error';

export function useInstanceNameCheck(instanceName: string, orgId: string | undefined, minLength = 3) {
  const [status, setStatus] = useState<InstanceNameStatus>('idle');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!instanceName || instanceName.length < minLength || !orgId) {
      setStatus('idle');
      return;
    }

    setStatus('checking');

    const timeout = setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const { data, error } = await supabase.functions.invoke('check-instance-name', {
          body: { instance_name: instanceName, org_id: orgId },
        });

        if (error) {
          setStatus('error');
          return;
        }

        setStatus(data?.available ? 'available' : 'taken');
      } catch {
        setStatus('error');
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [instanceName, orgId, minLength]);

  return status;
}
