import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, TestTube } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const netsuiteSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  accountId: z.string().min(1, "Account ID is required"),
  roleId: z.string().min(1, "Role ID is required"),
  consumerKey: z.string().min(1, "Consumer key is required"),
  consumerSecret: z.string().min(1, "Consumer secret is required"),
  tokenKey: z.string().min(1, "Token key is required"),
  tokenSecret: z.string().min(1, "Token secret is required"),
});

type NetsuiteFormData = z.infer<typeof netsuiteSchema>;

type TokenFormProps = {
  connection: any;
  onSuccess: () => void;
  onCancel: () => void;
};

export const TokenForm = ({ connection, onSuccess, onCancel }: TokenFormProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<NetsuiteFormData>({
    resolver: zodResolver(netsuiteSchema),
    defaultValues: {
      displayName: connection?.display_name || "",
      accountId: connection?.meta?.accountId || "",
      roleId: "",
      consumerKey: "",
      consumerSecret: "",
      tokenKey: "",
      tokenSecret: "",
    },
  });

  const onSubmit = async (data: NetsuiteFormData) => {
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
        adapter: "netsuite" as const,
        display_name: data.displayName,
        status: "active" as const,
        meta: {
          accountId: data.accountId,
          credentials: {
            roleId: data.roleId,
            consumerKey: data.consumerKey,
            consumerSecret: data.consumerSecret,
            tokenKey: data.tokenKey,
            tokenSecret: data.tokenSecret,
          },
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

      toast({ title: "NetSuite connection saved" });
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
      const values = getValues();
      const { data, error } = await supabase.functions.invoke("test-netsuite", {
        body: { credentials: values },
      });

      if (error) throw error;

      toast({
        title: "Test successful",
        description: "NetSuite credentials are valid",
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Alert>
        <AlertDescription className="text-xs">
          You'll need to create a Token-Based Authentication integration in
          NetSuite. All credentials are stored securely.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <div>
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            {...register("displayName")}
            placeholder="NetSuite Production"
          />
          {errors.displayName && (
            <p className="text-sm text-destructive mt-1">
              {errors.displayName.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="accountId">Account ID</Label>
          <Input
            id="accountId"
            {...register("accountId")}
            placeholder="1234567"
          />
          {errors.accountId && (
            <p className="text-sm text-destructive mt-1">
              {errors.accountId.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="roleId">Role ID</Label>
          <Input id="roleId" {...register("roleId")} placeholder="3" />
          {errors.roleId && (
            <p className="text-sm text-destructive mt-1">
              {errors.roleId.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="consumerKey">Consumer Key</Label>
            <Input
              id="consumerKey"
              type="password"
              {...register("consumerKey")}
            />
            {errors.consumerKey && (
              <p className="text-sm text-destructive mt-1">
                {errors.consumerKey.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="consumerSecret">Consumer Secret</Label>
            <Input
              id="consumerSecret"
              type="password"
              {...register("consumerSecret")}
            />
            {errors.consumerSecret && (
              <p className="text-sm text-destructive mt-1">
                {errors.consumerSecret.message}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="tokenKey">Token Key</Label>
            <Input
              id="tokenKey"
              type="password"
              {...register("tokenKey")}
            />
            {errors.tokenKey && (
              <p className="text-sm text-destructive mt-1">
                {errors.tokenKey.message}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="tokenSecret">Token Secret</Label>
            <Input
              id="tokenSecret"
              type="password"
              {...register("tokenSecret")}
            />
            {errors.tokenSecret && (
              <p className="text-sm text-destructive mt-1">
                {errors.tokenSecret.message}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleTest}
          disabled={isTesting}
        >
          {isTesting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            <>
              <TestTube className="h-4 w-4 mr-2" />
              Test Connection
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
