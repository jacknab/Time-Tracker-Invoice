import { useLocation, Link } from "wouter";
import { LayoutDashboard, CheckSquare, FileText, Settings as SettingsIcon } from "lucide-react";
import { ActiveTimer } from "./active-timer";
import { useGetSettings } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: settings } = useGetSettings();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tasks", label: "Tasks", icon: CheckSquare },
    { href: "/invoices", label: "Invoices", icon: FileText },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen flex w-full bg-background print:bg-white text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar shrink-0 flex flex-col no-print">
        <div className="p-6">
          <h1 className="text-xl font-bold tracking-tighter text-primary">WORKSHOP.</h1>
          <p className="text-xs text-muted-foreground mt-1 tracking-widest uppercase">Time & Billing</p>
        </div>
        
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors ${
                  isActive 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm border border-sidebar-border" 
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="bg-card rounded-md border border-card-border p-3">
            <p className="text-xs text-muted-foreground font-medium mb-1">CLIENT</p>
            <p className="text-sm font-bold">{settings?.clientName ?? "—"}</p>
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-muted-foreground">Rate</span>
              <span className="text-sm font-mono bg-accent px-1.5 rounded text-accent-foreground">
                {settings ? `${formatCurrency(settings.hourlyRate)}/hr` : "—"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border bg-card/50 px-8 py-3 flex justify-between items-center no-print">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            System Online
          </div>
          <ActiveTimer />
        </div>
        
        <div className="flex-1 overflow-auto">
          <div className="p-8 max-w-5xl mx-auto print:p-0 print:max-w-none">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
