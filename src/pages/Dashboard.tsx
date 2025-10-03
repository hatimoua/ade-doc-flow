import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useDropzone } from "react-dropzone";

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  // Fetch user's organization
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("profiles")
        .select("*, organizations(*)")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Fetch recent documents
  const { data: documents, refetch: refetchDocuments } = useQuery({
    queryKey: ["recent-documents", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return [];

      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return data;
    },
    enabled: !!profile?.organization_id,
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", profile?.organization_id],
    queryFn: async () => {
      if (!profile?.organization_id) return null;

      const [docsResult, recordsResult, readyResult] = await Promise.all([
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id),
        supabase.from("records").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id).eq("status", "pending_review"),
        supabase.from("documents").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id).eq("status", "ready"),
      ]);

      return {
        totalDocuments: docsResult.count || 0,
        pendingReview: recordsResult.count || 0,
        readyToPush: readyResult.count || 0,
      };
    },
    enabled: !!profile?.organization_id,
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!profile?.organization_id) {
      toast({
        title: "Error",
        description: "Organization not found",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      for (const file of acceptedFiles) {
        const fileName = `${Date.now()}-${file.name}`;
        const filePath = `${profile.organization_id}/${fileName}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Create document record
        const { error: dbError } = await supabase.from("documents").insert({
          organization_id: profile.organization_id,
          filename: file.name,
          storage_path: filePath,
          mime_type: file.type,
          file_size: file.size,
          status: "uploaded",
        });

        if (dbError) throw dbError;
      }

      toast({
        title: "Success",
        description: `Uploaded ${acceptedFiles.length} file(s)`,
      });

      refetchDocuments();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }, [profile, toast, refetchDocuments]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    disabled: uploading,
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      uploaded: { variant: "secondary", icon: Clock, label: "Uploaded" },
      parsing: { variant: "secondary", icon: Clock, label: "Parsing" },
      extracting: { variant: "secondary", icon: Clock, label: "Extracting" },
      ready: { variant: "default", icon: CheckCircle2, label: "Ready" },
      pushed: { variant: "default", icon: CheckCircle2, label: "Pushed" },
      error: { variant: "destructive", icon: AlertCircle, label: "Error" },
    };

    const config = variants[status] || variants.uploaded;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back to ADE Automator
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalDocuments ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingReview ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ready to Push</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.readyToPush ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Documents</CardTitle>
          <CardDescription>
            Drag and drop PDF or image files to start processing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            } ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input {...getInputProps()} />
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">
              {isDragActive ? "Drop files here" : "Drop files or click to upload"}
            </p>
            <p className="text-sm text-muted-foreground">
              Supports PDF, PNG, JPG, GIF, WEBP (max 50MB)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Recent Documents */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Documents</CardTitle>
          <CardDescription>Your latest uploaded documents</CardDescription>
        </CardHeader>
        <CardContent>
          {!documents || documents.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No documents yet. Upload your first document to get started.
            </p>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/documents/${doc.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">{doc.filename}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(doc.status)}
                </div>
              ))}
            </div>
          )}
          {documents && documents.length > 0 && (
            <Button
              variant="outline"
              className="w-full mt-4"
              onClick={() => navigate("/documents")}
            >
              View All Documents
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;