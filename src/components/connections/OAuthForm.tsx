import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type OAuthFormProps = {
  adapter: { id: string; name: string };
  connection: any;
  onSuccess: () => void;
  onCancel: () => void;
};

export const OAuthForm = ({ adapter, connection, onSuccess, onCancel }: OAuthFormProps) => {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  const [displayName, setDisplayName] = useState(
    connection?.display_name || `${adapter.name} Connection`
  );

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "oauth-start",
        {
          body: { adapter: adapter.id, displayName },
        }
      );

      if (error) throw error;

      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertDescription>
          You'll be redirected to {adapter.name} to authorize the connection.
          After authorization, you'll be brought back here.
        </AlertDescription>
      </Alert>

      <div>
        <Label htmlFor="displayName">Display Name</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder={`${adapter.name} Connection`}
        />
      </div>

      {connection && connection.status === "active" && (
        <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
          <p className="text-sm text-success-foreground">
            ✓ Connected to {connection.meta?.companyName || "your account"}
          </p>
          {connection.last_validated_at && (
            <p className="text-xs text-muted-foreground mt-1">
              Last validated:{" "}
              {new Date(connection.last_validated_at).toLocaleString()}
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleConnect} disabled={isConnecting}>
          {isConnecting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4 mr-2" />
              {connection ? "Reconnect" : "Connect"} to {adapter.name}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
