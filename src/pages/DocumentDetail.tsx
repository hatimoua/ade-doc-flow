import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, FileText, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DocumentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: document, isLoading } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: adeResult } = useQuery({
    queryKey: ["ade-result", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ade_results")
        .select("*")
        .eq("document_id", id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: record } = useQuery({
    queryKey: ["record", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("records")
        .select("*")
        .eq("document_id", id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const handleDownload = async () => {
    if (!document) return;

    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .download(document.storage_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = document.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Download failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </Layout>
    );
  }

  if (!document) {
    return (
      <Layout>
        <div className="text-center py-12">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Document not found</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/documents")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold tracking-tight">{document.filename}</h1>
            <p className="text-muted-foreground">
              Uploaded {new Date(document.created_at).toLocaleDateString()}
            </p>
          </div>
          <Badge
            variant={document.status === "ready" ? "default" : "secondary"}
          >
            {document.status}
          </Badge>
          <Button onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Document Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Document Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-[8.5/11] border rounded-lg bg-muted flex items-center justify-center">
                <div className="text-center">
                  <FileText className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    PDF preview will be available soon
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right: Tabs */}
          <div className="space-y-6">
            <Tabs defaultValue="extracted" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="extracted">Extracted</TabsTrigger>
                <TabsTrigger value="fields">Fields</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
              </TabsList>

              <TabsContent value="extracted" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Extracted Data</CardTitle>
                    <CardDescription>
                      Data extracted by Landing AI ADE
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {adeResult ? (
                      <div className="space-y-4">
                        {adeResult.confidence_score && (
                          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                            <span className="text-sm font-medium">Confidence Score</span>
                            <Badge variant="default">
                              {adeResult.confidence_score}%
                            </Badge>
                          </div>
                        )}
                        {adeResult.markdown_content && (
                          <div className="prose prose-sm max-w-none">
                            <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-96">
                              {adeResult.markdown_content}
                            </pre>
                          </div>
                        )}
                        <details className="border rounded-lg">
                          <summary className="p-3 cursor-pointer font-medium hover:bg-muted">
                            View Raw JSON
                          </summary>
                          <pre className="p-4 bg-muted text-xs overflow-auto max-h-96">
                            {JSON.stringify(adeResult.ade_json, null, 2)}
                          </pre>
                        </details>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <AlertCircle className="mx-auto h-8 w-8 mb-2" />
                        <p>No extraction data available yet</p>
                        <p className="text-sm">Process this document to extract data</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="fields" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Normalized Fields</CardTitle>
                    <CardDescription>
                      Review and edit extracted fields
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {record ? (
                      <div className="space-y-4">
                        <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-96">
                          {JSON.stringify(record.normalized_data, null, 2)}
                        </pre>
                        {record.validation_result && (
                          <details className="border rounded-lg">
                            <summary className="p-3 cursor-pointer font-medium hover:bg-muted">
                              Validation Results
                            </summary>
                            <pre className="p-4 bg-muted text-xs overflow-auto">
                              {JSON.stringify(record.validation_result, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <AlertCircle className="mx-auto h-8 w-8 mb-2" />
                        <p>No record created yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Document History</CardTitle>
                    <CardDescription>
                      Audit trail and status changes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        <div className="h-2 w-2 rounded-full bg-primary"></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">Document uploaded</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(document.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {document.updated_at !== document.created_at && (
                        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                          <div className="h-2 w-2 rounded-full bg-accent"></div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">Status updated</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(document.updated_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {document.status === "uploaded" && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle className="text-sm">Next Steps</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Button className="w-full">
                      Parse Document
                    </Button>
                    <Button className="w-full" variant="outline">
                      Extract with Schema
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default DocumentDetail;