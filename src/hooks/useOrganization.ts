import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  logo_url: string | null;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: "admin" | "member";
  can_clone_instance: boolean;
  created_at: string;
  profile?: { full_name: string | null; email: string | null };
}

// Global event emitter for org updates across hook instances
const orgListeners = new Set<() => void>();
export function notifyOrgUpdate() {
  orgListeners.forEach((fn) => fn());
}

export function useOrganization() {
  const { user, loading: authLoading } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchOrg = useCallback(async () => {
    if (authLoading) return;
    if (!user) { setOrg(null); setLoading(false); return; }
    
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!membership) {
      setLoading(false);
      return;
    }

    setIsAdmin(membership.role === "admin");

    const { data: orgData } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", membership.org_id)
      .single();

    if (orgData) setOrg(orgData as Organization);

    const { data: membersData } = await supabase
      .from("org_members")
      .select("*")
      .eq("org_id", membership.org_id);

    if (membersData) {
      const userIds = membersData.map(m => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      setMembers(membersData.map((m: any) => ({
        ...m,
        role: m.role as "admin" | "member",
        profile: profileMap.get(m.user_id) || null,
      })));
    }

    setLoading(false);
  }, [user, authLoading]);

  useEffect(() => { fetchOrg(); }, [fetchOrg]);

  // Listen for cross-instance org updates
  useEffect(() => {
    orgListeners.add(fetchOrg);
    return () => { orgListeners.delete(fetchOrg); };
  }, [fetchOrg]);

  const createOrg = async (name: string) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from("organizations")
      .insert({ name, created_by: user.id })
      .select()
      .single();
    if (error) throw error;
    notifyOrgUpdate();
    return data;
  };

  const refetch = useCallback(() => {
    fetchOrg();
    notifyOrgUpdate();
  }, [fetchOrg]);

  return { org, members, isAdmin, loading, createOrg, refetch };
}
