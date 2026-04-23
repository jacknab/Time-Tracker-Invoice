import { useEffect, useState } from "react";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  getGetSummaryQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save } from "lucide-react";

export default function SettingsPage() {
  const { data: settings, isLoading } = useGetSettings();
  const updateMutation = useUpdateSettings();
  const queryClient = useQueryClient();

  const [clientName, setClientName] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");

  useEffect(() => {
    if (settings) {
      setClientName(settings.clientName);
      setHourlyRate(String(settings.hourlyRate));
      setBusinessName(settings.businessName ?? "");
      setBusinessEmail(settings.businessEmail ?? "");
      setBusinessPhone(settings.businessPhone ?? "");
    }
  }, [settings]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rate = Number(hourlyRate);
    if (!clientName.trim()) {
      toast.error("Client name is required");
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error("Hourly rate must be greater than 0");
      return;
    }
    updateMutation.mutate(
      {
        data: {
          clientName: clientName.trim(),
          hourlyRate: rate,
          businessName: businessName.trim() || null,
          businessEmail: businessEmail.trim() || null,
          businessPhone: businessPhone.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.success("Settings saved");
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetSummaryQueryKey() });
        },
        onError: () => toast.error("Failed to save settings"),
      },
    );
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your client, billing rate, and business details that appear on invoices.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="bg-card border-card-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Client &amp; Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="clientName" className="text-sm font-medium">
                    Client Name
                  </label>
                  <Input
                    id="clientName"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Tom Lam"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown on the sidebar and as the "Bill To" on every invoice.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="hourlyRate" className="text-sm font-medium">
                    Hourly Rate (USD)
                  </label>
                  <Input
                    id="hourlyRate"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={hourlyRate}
                    onChange={(e) => setHourlyRate(e.target.value)}
                    placeholder="7.50"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Existing invoices keep the rate they were created with.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-card-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Your Business Info</CardTitle>
              <p className="text-sm text-muted-foreground">
                These details appear in the "From" section of every invoice.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="businessName" className="text-sm font-medium">
                    Business / Your Name
                  </label>
                  <Input
                    id="businessName"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. TJ Benjamin Developing"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="businessEmail" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="businessEmail"
                    type="email"
                    value={businessEmail}
                    onChange={(e) => setBusinessEmail(e.target.value)}
                    placeholder="e.g. you@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="businessPhone" className="text-sm font-medium">
                    Phone
                  </label>
                  <Input
                    id="businessPhone"
                    type="tel"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                    placeholder="e.g. (720) 243-6886"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit" disabled={updateMutation.isPending} className="gap-2">
              <Save className="w-4 h-4" />
              {updateMutation.isPending ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
