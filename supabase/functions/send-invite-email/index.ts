import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { org_id, email, invite_token, org_name, magic_link } = await req.json();

    if (!org_id || !email || !invite_token) {
      throw new Error("org_id, email e invite_token são obrigatórios");
    }

    // Get Resend config for this org
    const { data: resendConfig, error: configErr } = await supabase
      .from("resend_configs")
      .select("api_key, from_email, from_name")
      .eq("org_id", org_id)
      .maybeSingle();

    if (configErr) throw configErr;

    if (!resendConfig) {
      console.log("[send-invite-email] No Resend config found for org, skipping email");
      return new Response(
        JSON.stringify({ success: false, skipped: true, reason: "no_resend_config" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use magic link if provided, otherwise fallback to plain invite link
    const siteUrl = Deno.env.get("SITE_URL") || supabaseUrl.replace(".supabase.co", ".lovable.app");
    const inviteLink = magic_link || `${siteUrl}/invite/${invite_token}`;

    const displayName = org_name || "a organização";

    // Send email via Resend API
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendConfig.api_key}`,
      },
      body: JSON.stringify({
        from: `${resendConfig.from_name} <${resendConfig.from_email}>`,
        to: [email],
        subject: `Convite para ${displayName}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#141a23;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#1a2332;border-radius:12px;overflow:hidden;border:1px solid #243044;">
    <div style="padding:32px 24px 24px;text-align:center;">
      <div style="width:48px;height:48px;margin:0 auto 16px;background:linear-gradient(135deg,#297F7A,#3CB8B0);border-radius:12px;display:flex;align-items:center;justify-content:center;">
        <span style="color:#ffffff;font-size:22px;font-weight:700;">${(displayName).charAt(0).toUpperCase()}</span>
      </div>
      <h1 style="color:#e8ecf1;font-size:20px;margin:0 0 4px;font-weight:600;">Você foi convidado!</h1>
      <p style="color:#7a8ba3;font-size:13px;margin:0;">Para fazer parte de <strong style="color:#e8ecf1;">${displayName}</strong></p>
    </div>
    <div style="padding:0 24px 32px;">
      <div style="background:#141a23;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="color:#94a3b8;font-size:13px;line-height:1.6;margin:0;">
          Clique no botão abaixo para aceitar o convite e acessar a plataforma. Você entrará logado automaticamente e poderá definir sua senha.
        </p>
      </div>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="${inviteLink}" target="_blank" style="display:inline-block;background:linear-gradient(135deg,#297F7A,#3CB8B0);color:#ffffff;text-decoration:none;padding:12px 40px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.01em;">
          Aceitar Convite
        </a>
      </div>
      <p style="color:#4a5b70;font-size:11px;line-height:1.5;text-align:center;margin:0;">
        Se o botão não funcionar, copie e cole este link:<br>
        <a href="${inviteLink}" target="_blank" style="color:#3CB8B0;word-break:break-all;font-size:11px;">${inviteLink}</a>
      </p>
    </div>
    <div style="border-top:1px solid #243044;padding:16px 24px;text-align:center;">
      <p style="color:#4a5b70;font-size:11px;margin:0;">
        Este convite expira em 7 dias.
      </p>
    </div>
  </div>
</body>
</html>
        `.trim(),
      }),
    });

    if (!resendResponse.ok) {
      const errBody = await resendResponse.text();
      console.error("[send-invite-email] Resend API error:", resendResponse.status, errBody);
      throw new Error(`Resend API error: ${resendResponse.status} - ${errBody}`);
    }

    const result = await resendResponse.json();
    console.log("[send-invite-email] Email sent successfully:", result.id);

    return new Response(
      JSON.stringify({ success: true, email_id: result.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("[send-invite-email] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
