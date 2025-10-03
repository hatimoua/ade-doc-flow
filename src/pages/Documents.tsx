import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Search, Download, Clock, CheckCircle2, AlertCircle } from "lucide-react";

const Documents = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: documents } = useQuery({
    queryKey: ["documents", profile?.organization_id, searchQuery],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      let query = supabase
        .from("documents")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false });

      if (searchQuery) {
        query = query.ilike("filename", `%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { variant: any; icon: any; label: string }> = {
      uploaded: { variant: "secondary", icon: Clock, label: "Uploaded" },
      parsing: { variant: "secondary", icon: Clock, label: "Parsing" },
      extracting: { variant: "secondary", icon: Clock, label: "Extracting" },
      ready: { variant: "default", icon: CheckCircle2, label: "Ready" },
      pushed: { variant: "default", icon: CheckCircle2, label: "Pushed" },
      error: { variant: "destructive", icon: AlertCircle, label: "Error" },
    };
    return configs[status] || configs.uploaded;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Documents</h1>
            <p className="text-muted-foreground">
              Manage and track all your uploaded documents
            </p>
          </div>
          <Button onClick={() => navigate("/dashboard")}>
            <FileText className="mr-2 h-4 w-4" />
            Upload New
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Documents</CardTitle>
            <div className="flex items-center gap-2 mt-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            {!documents || documents.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? "No documents found" : "No documents yet"}
                </p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filename</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Uploaded</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => {
                      const statusConfig = getStatusConfig(doc.status);
                      const StatusIcon = statusConfig.icon;

                      return (
                        <TableRow
                          key={doc.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/documents/${doc.id}`)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-primary" />
                              {doc.filename}
                            </div>
                          </TableCell>
                          <TableCell>{doc.doc_type}</TableCell>
                          <TableCell>
                            {doc.file_size ? formatFileSize(doc.file_size) : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusConfig.variant} className="gap-1">
                              <StatusIcon className="h-3 w-3" />
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(doc.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/documents/${doc.id}`);
                              }}
                            >
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Documents;