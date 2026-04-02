import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GroupForPicture {
  id: string;
  whatsapp_group_id: string;
  picture_url?: string | null;
}

export function useGroupPictures(orgId: string | undefined, groups: GroupForPicture[]) {
  const [pictures, setPictures] = useState<Record<string, string | null>>({});
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!orgId || groups.length === 0) return;

    // Set pictures from DB immediately
    const fromDb: Record<string, string | null> = {};
    const missingGroupIds: string[] = [];

    for (const g of groups) {
      if (g.picture_url) {
        fromDb[g.id] = g.picture_url;
      } else {
        missingGroupIds.push(g.whatsapp_group_id);
      }
    }

    setPictures(fromDb);

    // Fetch missing from Evolution API
    if (missingGroupIds.length === 0 || fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchMissing = async () => {
      try {
        const { data } = await supabase.functions.invoke('fetch-group-picture', {
          body: { org_id: orgId, group_ids: missingGroupIds },
        });

        if (data?.pictures) {
          const newPics: Record<string, string | null> = { ...fromDb };
          for (const g of groups) {
            if (!g.picture_url && data.pictures[g.whatsapp_group_id]) {
              newPics[g.id] = data.pictures[g.whatsapp_group_id];
            }
          }
          setPictures(newPics);
        }
      } catch (err) {
        console.warn('[useGroupPictures] fetch error:', err);
      }
    };

    fetchMissing();
  }, [orgId, groups.length]);

  return pictures;
}
