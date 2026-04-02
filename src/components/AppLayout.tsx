import { ReactNode, useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Settings, LogOut, Users, PanelLeftClose, PanelLeft, BookOpen, Menu, X, Sun, Moon, FileText } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useOrganization";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import defaultLogo from "@/assets/logo.png";

function profileInitials(profile: { full_name: string | null } | null | undefined, user: any) {
  if (profile?.full_name) return profile.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  return user?.email?.charAt(0).toUpperCase() || "?";
}

const navItems = [
  { icon: LayoutDashboard, label: "Grupos", path: "/" },
  { icon: FileText, label: "Resumos", path: "/summaries" },
  { icon: BookOpen, label: "Knowledge", path: "/knowledge" },
  { icon: Users, label: "Equipe", path: "/team" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

function SidebarContent({ collapsed, toggleCollapsed, org, user, signOut, location, onNavigate, isMobile, profile }: {
  collapsed: boolean;
  toggleCollapsed: () => void;
  org: any;
  user: any;
  signOut: () => void;
  location: any;
  onNavigate?: () => void;
  isMobile?: boolean;
  profile?: { full_name: string | null; avatar_url: string | null } | null;
}) {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <div className={`flex items-center ${collapsed ? "justify-center px-2" : "gap-2 px-6"} h-14 shrink-0 border-b border-border`}>
        <Avatar className="h-8 w-8 rounded-lg shrink-0">
          <AvatarImage src={org?.logo_url || defaultLogo} alt={org?.name || "Logo"} className="object-cover" />
          <AvatarFallback className="rounded-lg gradient-primary text-primary-foreground text-sm font-semibold">
            {(org?.name || "G").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {!collapsed && <span className="text-lg font-semibold text-foreground tracking-tight">{org?.name || "GroupLens"}</span>}
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = item.path === "/" ? location.pathname === "/" : location.pathname.startsWith(item.path);
          const link = (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={`flex items-center gap-3 ${collapsed ? "justify-center px-2" : "px-3"} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive ? "bg-primary/10 text-primary" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && item.label}
            </Link>
          );
          if (collapsed) {
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }
          return link;
        })}
      </nav>

      {!isMobile && (
        <div className="px-2 py-2 space-y-1">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`w-full flex items-center ${collapsed ? "justify-center" : ""} gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors`}
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {!collapsed && <span>{theme === "dark" ? "Claro" : "Escuro"}</span>}
          </button>
          <button
            onClick={toggleCollapsed}
            className={`w-full flex items-center ${collapsed ? "justify-center" : ""} gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors`}
            title={collapsed ? "Expandir" : "Recolher"}
          >
            {collapsed ? <PanelLeft className="h-4 w-4" /> : <><PanelLeftClose className="h-4 w-4" /><span>Recolher</span></>}
          </button>
        </div>
      )}
      {isMobile && (
        <div className="px-2 py-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
          </button>
        </div>
      )}

      <div className={`${collapsed ? "px-2" : "px-3"} py-[13px] border-t border-border`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3 px-3"} py-1.5`}>
          {collapsed ? (
            <Popover>
              <PopoverTrigger asChild>
                <button className="shrink-0 hover:ring-2 hover:ring-primary/30 transition-all rounded-full">
                  <Avatar className="h-8 w-8">
                    {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="Perfil" className="object-cover" />}
                    <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                      {profileInitials(profile, user)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </PopoverTrigger>
              <PopoverContent side="right" align="end" className="w-48 p-2">
                <p className="text-sm font-medium text-foreground truncate px-2">{profile?.full_name || user?.email || "Usuário"}</p>
                <p className="text-xs text-muted-foreground truncate px-2 mb-2">{user?.email}</p>
                <Link
                  to="/profile"
                  onClick={onNavigate}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-foreground hover:bg-accent transition-colors"
                >
                  Meu perfil
                </Link>
                <button
                  onClick={() => { signOut(); onNavigate?.(); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair
                </button>
              </PopoverContent>
            </Popover>
          ) : (
            <>
              <Link to="/profile" onClick={onNavigate} className="flex items-center gap-3 flex-1 min-w-0 rounded-lg px-1 py-1 -mx-1 hover:bg-sidebar-accent transition-colors">
                <Avatar className="h-8 w-8 shrink-0">
                  {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="Perfil" className="object-cover" />}
                  <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                    {profileInitials(profile, user)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{profile?.full_name || user?.email || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
              </Link>
              <button onClick={() => { signOut(); onNavigate?.(); }} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" title="Sair">
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// Context to allow child pages to render the mobile menu button in their own header
import { createContext, useContext } from "react";

interface MobileMenuContextType {
  openMobileMenu: () => void;
}

const MobileMenuContext = createContext<MobileMenuContextType | null>(null);

export function useMobileMenu() {
  return useContext(MobileMenuContext);
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const { org } = useOrganization();
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("sidebar-collapsed") === "true";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => { if (data) setProfile(data); });
  }, [user]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  // Pages that have their own header and will render the menu button themselves
  const isChatPage = location.pathname.startsWith("/chat/");

  return (
    <MobileMenuContext.Provider value={{ openMobileMenu: () => setMobileOpen(true) }}>
      <TooltipProvider delayDuration={0}>
        <div className="flex h-screen overflow-hidden bg-background">
          {/* Desktop sidebar */}
          <aside className={`hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-300 ${collapsed ? "w-16" : "w-64"}`}>
            <SidebarContent
              collapsed={collapsed}
              toggleCollapsed={toggleCollapsed}
              org={org}
              user={user}
              signOut={signOut}
              location={location}
              profile={profile}
            />
          </aside>

          {/* Mobile overlay */}
          {mobileOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
              onClick={() => setMobileOpen(false)}
            />
          )}

          {/* Mobile drawer */}
          <aside
            className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col border-r border-border bg-sidebar transition-transform duration-300 ease-in-out md:hidden ${
              mobileOpen ? "translate-x-0" : "-translate-x-full"
            }`}
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="absolute right-3" style={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent
              collapsed={false}
              toggleCollapsed={toggleCollapsed}
              org={org}
              user={user}
              signOut={signOut}
              location={location}
              onNavigate={() => setMobileOpen(false)}
              isMobile
              profile={profile}
            />
          </aside>

          <main className="flex-1 flex flex-col overflow-hidden relative">
            <div className={`flex-1 overflow-y-auto`}>
              {/* Sticky mobile menu header — hidden on pages with their own header */}
              {!isChatPage && (
                <div className="sticky top-0 z-30 md:hidden backdrop-blur-md bg-background/60" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                  <div className="h-12 relative">
                    <button
                      onClick={() => setMobileOpen(true)}
                      className="absolute top-3 left-3 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <Menu className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
              {children}
            </div>
          </main>
        </div>
      </TooltipProvider>
    </MobileMenuContext.Provider>
  );
}
