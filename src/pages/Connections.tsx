import { useState } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Star,
  MoreVertical
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConnectionDialog } from "@/components/connections/ConnectionDialog";

type Connection = {
  id: string;
  adapter: string;
  status: string;
  display_name: string;
  is_default: boolean;
  last_validated_at: string | null;
  meta: any;
};

const ADAPTERS = [
  {
    id: "quickbooks",
    name: "QuickBooks Online",
    description: "Connect via OAuth 2.0",
    icon: "📊",
    type: "oauth" as const,
  },
  {
    id: "xero",
    name: "Xero",
    description: "Connect via OAuth 2.0",
    icon: "📈",
    type: "oauth" as const,
  },
  {
    id: "netsuite",
    name: "NetSuite",
    description: "Token-based authentication",
    icon: "☁️",
    type: "token" as const,
  },
  {
    id: "webhook",
    name: "Webhook",
    description: "Push to custom endpoint",
    icon: "🔗",
    type: "webhook" as const,
  },
  {
    id: "csv",
    name: "CSV Export",
    description: "Download or upload CSV files",
    icon: "📄",
    type: "csv" as const,
  },
];

const Connections = () => {
  const { toast } = useToast();
  const [selectedAdapter, setSelectedAdapter] = useState<typeof ADAPTERS[0] | null>(null);
  const [editConnection, setEditConnection] = useState<Connection | null>(null);

  const { data: connections, refetch } = useQuery({
    queryKey: ["connections"],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      const { data, error } = await supabase
        .from("connections")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Connection[];
    },
  });

  const handleSetDefault = async (connectionId: string) => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (!profile) throw new Error("Profile not found");

      // Unset all defaults
      await supabase
        .from("connections")
        .update({ is_default: false })
        .eq("organization_id", profile.organization_id);

      // Set new default
      const { error } = await supabase
        .from("connections")
        .update({ is_default: true })
        .eq("id", connectionId);

      if (error) throw error;

      toast({ title: "Default connection updated" });
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (connectionId: string) => {
    try {
      const { error } = await supabase
        .from("connections")
        .delete()
        .eq("id", connectionId);

      if (error) throw error;

      toast({ title: "Connection deleted" });
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "error":
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      active: "default",
      error: "destructive",
      disconnected: "secondary",
    };
    return (
      <Badge variant={variants[status] || "secondary"}>
        {status}
      </Badge>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">ERP Connections</h1>
            <p className="text-muted-foreground mt-1">
              Connect your accounting systems and configure integrations
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ADAPTERS.map((adapter) => {
            const existingConnections = connections?.filter(
              (c) => c.adapter === adapter.id
            ) || [];

            return (
              <Card key={adapter.id} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl">{adapter.icon}</div>
                      <div>
                        <CardTitle className="text-lg">{adapter.name}</CardTitle>
                        <CardDescription className="text-sm">
                          {adapter.description}
                        </CardDescription>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {existingConnections.length > 0 ? (
                    <div className="space-y-2">
                      {existingConnections.map((conn) => (
                        <div
                          key={conn.id}
                          className="flex items-center justify-between p-2 rounded-md border bg-card"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {getStatusIcon(conn.status)}
                            <span className="text-sm font-medium truncate">
                              {conn.display_name}
                            </span>
                            {conn.is_default && (
                              <Star className="h-3 w-3 fill-primary text-primary flex-shrink-0" />
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {getStatusBadge(conn.status)}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setEditConnection(conn);
                                    setSelectedAdapter(adapter);
                                  }}
                                >
                                  Edit
                                </DropdownMenuItem>
                                {!conn.is_default && (
                                  <DropdownMenuItem onClick={() => handleSetDefault(conn.id)}>
                                    Set as Default
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleDelete(conn.id)}
                                  className="text-destructive"
                                >
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No connections configured
                    </p>
                  )}
                  <Button
                    onClick={() => {
                      setSelectedAdapter(adapter);
                      setEditConnection(null);
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Connection
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {selectedAdapter && (
        <ConnectionDialog
          adapter={selectedAdapter}
          connection={editConnection}
          onClose={() => {
            setSelectedAdapter(null);
            setEditConnection(null);
          }}
          onSuccess={() => {
            refetch();
            setSelectedAdapter(null);
            setEditConnection(null);
          }}
        />
      )}
    </Layout>
  );
};

export default Connections;
