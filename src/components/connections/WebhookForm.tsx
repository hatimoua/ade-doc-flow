import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const webhookSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  url: z.string().url("Must be a valid URL"),
  secret: z.string().min(8, "Secret must be at least 8 characters"),
});

type WebhookFormData = z.infer<typeof webhookSchema>;

type WebhookFormProps = {
  connection: any;
  onSuccess: () => void;
  onCancel: () => void;
};

export const WebhookForm = ({ connection, onSuccess, onCancel }: WebhookFormProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<WebhookFormData>({
    resolver: zodResolver(webhookSchema),
    defaultValues: {
      displayName: connection?.display_name || "",
      url: connection?.meta?.url || "",
      secret: "",
    },
  });

  const onSubmit = async (data: WebhookFormData) => {
    setIsLoading(true);
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const connectionData = {
        organization_id: profile.organization_id,
        adapter: "webhook" as const,
        display_name: data.displayName,
        status: "active" as const,
        meta: {
          url: data.url,
          secret: data.secret,
        },
      };

      if (connection) {
        const { error } = await supabase
          .from("connections")
          .update(connectionData)
          .eq("id", connection.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("connections")
          .insert(connectionData);
        if (error) throw error;
      }

      toast({ title: "Webhook connection saved" });
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const url = watch("url");
      const secret = watch("secret");

      const { data, error } = await supabase.functions.invoke("test-webhook", {
        body: { url, secret },
      });

      if (error) throw error;

      toast({
        title: "Test successful",
        description: "Webhook endpoint responded successfully",
      });
    } catch (error: any) {
      toast({
        title: "Test failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const samplePayload = {
    record_id: "550e8400-e29b-41d4-a716-446655440000",
    record_type: "invoice",
    data: {
      vendor_name: "Acme Corp",
      invoice_number: "INV-001",
      invoice_date: "2025-01-15",
      total: 1250.50,
      currency: "USD",
    },
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            {...register("displayName")}
            placeholder="My Webhook"
          />
          {errors.displayName && (
            <p className="text-sm text-destructive mt-1">
              {errors.displayName.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="url">Webhook URL</Label>
          <Input
            id="url"
            {...register("url")}
            placeholder="https://api.example.com/webhook"
          />
          {errors.url && (
            <p className="text-sm text-destructive mt-1">{errors.url.message}</p>
          )}
        </div>

        <div>
          <Label htmlFor="secret">Webhook Secret</Label>
          <Input
            id="secret"
            type="password"
            {...register("secret")}
            placeholder="Enter a secure secret"
          />
          {errors.secret && (
            <p className="text-sm text-destructive mt-1">
              {errors.secret.message}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Used to sign webhook requests with HMAC-SHA256
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sample Payload</CardTitle>
          <CardDescription>
            This is the structure of data that will be sent to your webhook
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={JSON.stringify(samplePayload, null, 2)}
            readOnly
            className="font-mono text-xs h-48"
          />
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleTest}
          disabled={isTesting || !watch("url") || !watch("secret")}
        >
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send Test
            </>
          )}
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Connection"
          )}
        </Button>
      </div>
    </form>
  );
};
