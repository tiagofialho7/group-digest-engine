import { useState, useEffect, useRef } from "react";
import { Camera, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [originalName, setOriginalName] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setFullName(data.full_name || "");
        setOriginalName(data.full_name || "");
        setAvatarUrl(data.avatar_url || null);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao enviar foto: " + (err.message || "Tente novamente"));
    } finally {
      setUploading(false);
    }
  };

  const handleSaveName = async () => {
    if (!user || fullName.trim() === originalName) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("user_id", user.id);
      if (error) throw error;
      setOriginalName(fullName.trim());
      toast.success("Nome atualizado!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  const initials = fullName
    ? fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
    : user?.email?.charAt(0).toUpperCase() || "?";

  const hasChanges = fullName.trim() !== originalName;

  return (
    <div className="p-4 md:p-6 max-w-md mx-auto">
      <h1 className="text-base font-semibold text-foreground mb-6">Meu perfil</h1>

      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative group">
          <Avatar className="h-24 w-24">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="Foto de perfil" />}
            <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 text-white animate-spin" />
            ) : (
              <Camera className="h-5 w-5 text-white" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUploadAvatar}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">Clique para alterar</p>
      </div>

      {/* Name */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Nome</label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Seu nome completo"
            className="h-9 text-sm bg-muted/30 border-border"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Email</label>
          <Input
            value={user?.email || ""}
            disabled
            className="h-9 text-sm bg-muted/30 border-border opacity-60"
          />
        </div>

        <Button
          size="sm"
          onClick={handleSaveName}
          disabled={!hasChanges || saving}
          className="w-full gap-1.5 text-xs h-9"
        >
          {saving ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando</>
          ) : (
            <><Check className="h-3.5 w-3.5" /> Salvar</>
          )}
        </Button>
      </div>
    </div>
  );
}
