import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { action, org_id, email, token, member_id, new_role } = await req.json();

    // ===== INVITE =====
    if (action === "invite") {
      if (!org_id || !email) throw new Error("org_id e email são obrigatórios");

      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "";

      // Verify caller is admin
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Não autorizado");
      const jwt = authHeader.replace("Bearer ", "");
      const { data: { user: callerUser }, error: userErr } = await supabase.auth.getUser(jwt);
      if (userErr || !callerUser) throw new Error("Não autorizado");
      const callerId = callerUser.id;

      const { data: callerMember } = await supabase
        .from("org_members")
        .select("role")
        .eq("org_id", org_id)
        .eq("user_id", callerId)
        .single();

      if (!callerMember || callerMember.role !== "admin") {
        throw new Error("Apenas admins podem convidar membros");
      }

      const lowerEmail = email.toLowerCase();
      const siteUrl = origin || Deno.env.get("SITE_URL") || `https://${Deno.env.get("SUPABASE_PROJECT_REF") || "app"}.lovableproject.com`;

      // Create invite record
      const { data: invite, error: invErr } = await supabase
        .from("org_invites")
        .insert({
          org_id,
          email: lowerEmail,
          invited_by: callerId,
        })
        .select()
        .single();

      if (invErr) {
        if (invErr.code === "23505") throw new Error("Convite já enviado para este e-mail");
        throw invErr;
      }

      // Generate auth link - try 'invite' first (new user), fallback to 'magiclink' (existing user)
      let actionLink: string | null = null;
      const redirectTo = `${siteUrl}/invite/${invite.token}`;

      const { data: inviteData, error: inviteError } = await supabase.auth.admin.generateLink({
        type: "invite",
        email: lowerEmail,
        options: {
          redirectTo,
          data: { invited_to_org: org_id },
        },
      });

      if (inviteError) {
        // User already exists, generate magic link instead
        if (inviteError.message?.includes("already") || (inviteError as any).status === 422 || (inviteError as any).code === "email_exists") {
          console.log("[manage-org-members] User exists, generating magic link for:", lowerEmail);
          const { data: magicData, error: magicError } = await supabase.auth.admin.generateLink({
            type: "magiclink",
            email: lowerEmail,
            options: { redirectTo },
          });
          if (magicError) {
            console.error("[manage-org-members] Error generating magic link:", magicError);
            throw new Error("Erro ao gerar link de acesso");
          }
          actionLink = magicData?.properties?.action_link ?? null;
        } else {
          console.error("[manage-org-members] Error generating invite link:", inviteError);
          throw new Error("Erro ao gerar link de convite");
        }
      } else {
        actionLink = inviteData?.properties?.action_link ?? null;
      }

      console.log("[manage-org-members] Link generated for:", lowerEmail, "link exists:", !!actionLink);

      return new Response(JSON.stringify({ success: true, token: invite.token, invite_link: actionLink }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== REGENERATE LINK =====
    if (action === "regenerate_link") {
      if (!token) throw new Error("Token é obrigatório");

      const authHeader = req.headers.get("Authorization");
      if (!authHeader) throw new Error("Não autorizado");
      const jwt = authHeader.replace("Bearer ", "");
      const { data: { user: callerUser }, error: userErr } = await supabase.auth.getUser(jwt);
      if (userErr || !callerUser) throw new Error("Não autorizado");

      const { data: invite } = await supabase
        .from("org_invites")
        .select("*")
        .eq("token", token)
        .eq("status", "pending")
        .single();

      if (!invite) throw new Error("Convite não encontrado");

      // Verify caller is admin of the org
      const { data: callerMember } = await supabase
        .from("org_members")
        .select("role")
        .eq("org_id", invite.org_id)
        .eq("user_id", callerUser.id)
        .single();

      if (!callerMember || callerMember.role !== "admin") {
        throw new Error("Apenas admins podem regenerar links");
      }

      const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/+$/, "") || "";
      const siteUrl = origin || Deno.env.get("SITE_URL") || `https://${Deno.env.get("SUPABASE_PROJECT_REF") || "app"}.lovableproject.com`;
      const redirectTo = `${siteUrl}/invite/${invite.token}`;

      // Try invite first, fallback to magiclink
      let actionLink: string | null = null;
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.generateLink({
        type: "invite",
        email: invite.email,
        options: { redirectTo },
      });

      if (inviteError) {
        const { data: magicData, error: magicError } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: invite.email,
          options: { redirectTo },
        });
        if (magicError) throw new Error("Erro ao regenerar link");
        actionLink = magicData?.properties?.action_link ?? null;
      } else {
        actionLink = inviteData?.properties?.action_link ?? null;
      }

      return new Response(JSON.stringify({ success: true, invite_link: actionLink }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== ACCEPT invite by token =====
    if (action === "accept") {
      if (!token) throw new Error("Token é obrigatório");

      const { data: invite, error: invErr } = await supabase
        .from("org_invites")
        .select("*")
        .eq("token", token)
        .eq("status", "pending")
        .single();

      if (invErr || !invite) {
        return new Response(JSON.stringify({ success: false, error: "Convite não encontrado ou expirado" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(invite.expires_at) < new Date()) {
        await supabase.from("org_invites").update({ status: "expired" }).eq("id", invite.id);
        return new Response(JSON.stringify({ success: false, error: "Convite expirado" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get authenticated user
      const authHeader = req.headers.get("Authorization");
      let acceptingUserId: string | null = null;

      if (authHeader) {
        const jwt = authHeader.replace("Bearer ", "");
        const { data: { user: authUser } } = await supabase.auth.getUser(jwt);
        acceptingUserId = authUser?.id || null;
      }

      if (!acceptingUserId) {
        const { data: userData } = await supabase.auth.admin.listUsers();
        const invitedUser = userData?.users?.find(u => u.email === invite.email);
        acceptingUserId = invitedUser?.id || null;
      }

      if (!acceptingUserId) {
        return new Response(JSON.stringify({ success: false, error: "Usuário precisa criar uma conta primeiro" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Ensure profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", acceptingUserId)
        .maybeSingle();

      if (!existingProfile) {
        await supabase.from("profiles").insert({
          user_id: acceptingUserId,
          email: invite.email,
        });
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from("org_members")
        .select("id")
        .eq("org_id", invite.org_id)
        .eq("user_id", acceptingUserId)
        .maybeSingle();

      if (existing) {
        await supabase.from("org_invites").update({ status: "accepted" }).eq("id", invite.id);
        return new Response(JSON.stringify({ success: true, message: "Já é membro" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: memberErr } = await supabase.from("org_members").insert({
        org_id: invite.org_id,
        user_id: acceptingUserId,
        role: invite.role,
      });

      if (memberErr) throw memberErr;

      await supabase.from("org_invites").update({ status: "accepted" }).eq("id", invite.id);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== UPDATE ROLE =====
    if (action === "update_role") {
      if (!member_id || !new_role) throw new Error("member_id e new_role são obrigatórios");
      const { error } = await supabase.from("org_members").update({ role: new_role }).eq("id", member_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ===== REMOVE MEMBER =====
    if (action === "remove_member") {
      if (!member_id) throw new Error("member_id é obrigatório");
      const { error } = await supabase.from("org_members").delete().eq("id", member_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[manage-org-members] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
