import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, FileText, AlertCircle, Eye, Send, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DocumentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [showPushDialog, setShowPushDialog] = useState(false);
  const [previewPayload, setPreviewPayload] = useState<any>(null);
  const [selectedConnection, setSelectedConnection] = useState<string>("");
  const [pushing, setPushing] = useState(false);
  const [selectedDocType, setSelectedDocType] = useState<string>("");
  const [extracting, setExtracting] = useState(false);

  const { data: document, isLoading, refetch } = useQuery({
    queryKey: ["document", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select(`
          *,
          records (
            *,
            push_jobs (
              id,
              status,
              created_at,
              completed_at,
              error_message,
              connections (
                display_name,
                adapter
              )
            )
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      
      // Set initial doc type from document
      if (data?.doc_type && !selectedDocType) {
        setSelectedDocType(data.doc_type);
      } else if (!selectedDocType) {
        // Default to receipt for images
        setSelectedDocType(data?.mime_type?.startsWith('image/') ? 'receipt' : 'invoice');
      }
      
      return data;
    },
  });

  // Get document preview URL
  const { data: documentUrl } = useQuery({
    queryKey: ["documentUrl", document?.storage_path],
    queryFn: async () => {
      if (!document?.storage_path) return null;
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(document.storage_path, 3600);
      return data?.signedUrl || null;
    },
    enabled: !!document?.storage_path,
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

  const { data: connections } = useQuery({
    queryKey: ["connections"],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .single();

      if (!profile?.organization_id) return [];

      const { data, error } = await supabase
        .from("connections")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq("status", "active");

      if (error) throw error;
      
      const defaultConn = data?.find(c => c.is_default);
      if (defaultConn && !selectedConnection) {
        setSelectedConnection(defaultConn.id);
      }
      
      return data || [];
    },
  });

  const record = document?.records?.[0];
  const pushJob = record?.push_jobs?.[0];

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

  const handlePreviewPayload = async () => {
    if (!record) return;

    try {
      const { data, error } = await supabase.functions.invoke('approve-and-push', {
        body: {
          recordId: record.id,
          connectionId: selectedConnection || undefined,
          preview: true,
        },
      });

      if (error) throw error;
      setPreviewPayload(data);
      setShowPreview(true);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDocTypeChange = async (newDocType: string) => {
    setSelectedDocType(newDocType);
    
    // Persist doc type immediately
    if (document) {
      await supabase
        .from("documents")
        .update({ doc_type: newDocType })
        .eq("id", document.id);
      
      toast({
        title: "Document type updated",
        description: `Changed to ${newDocType}`,
      });
      
      refetch();
    }
  };

  const handleRunExtract = async () => {
    if (!document) return;
    
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('parse-document', {
        body: { documentId: document.id }
      });
      
      if (error) throw error;
      
      toast({
        title: "Extraction complete",
        description: `Extracted as ${data.docType} with ${(data.confidence * 100).toFixed(0)}% confidence`,
      });
      
      refetch();
    } catch (error: any) {
      toast({
        title: "Extraction failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  };

  const handleApproveAndPush = async () => {
    if (!record) return;

    setPushing(true);
    try {
      const { data, error } = await supabase.functions.invoke('approve-and-push', {
        body: {
          recordId: record.id,
          connectionId: selectedConnection || undefined,
          preview: false,
        },
      });

      if (error) throw error;

      // Handle CSV download
      const selectedConn = connections?.find(c => c.id === selectedConnection);
      if (selectedConn?.adapter === 'csv' && data?.csvData) {
        const blob = new Blob([data.csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement('a');
        a.href = url;
        a.download = `${document.filename.replace(/\.[^/.]+$/, '')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        toast({
          title: "Success",
          description: "CSV file generated and downloaded",
        });
      } else {
        toast({
          title: "Success",
          description: "Record approved and pushed successfully",
        });
      }

      setShowPreview(false);
      setShowPushDialog(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setPushing(false);
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
          <div className="flex items-center gap-2">
            <Select value={selectedDocType} onValueChange={handleDocTypeChange}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Doc Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="invoice">Invoice</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              onClick={handleRunExtract}
              disabled={extracting || document.status === 'parsing'}
            >
              {extracting ? "Extracting..." : "Run Extract"}
            </Button>
            <Badge variant={document.status === "ready" ? "default" : "secondary"}>
              {document.status}
            </Badge>
            {pushJob && (
              <Badge variant={pushJob.status === 'success' ? 'default' : 'secondary'}>
                Job: {pushJob.status}
              </Badge>
            )}
          </div>
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
              {documentUrl ? (
                <div className="border rounded-lg overflow-hidden">
                  {document.mime_type?.startsWith('image/') ? (
                    <img 
                      src={documentUrl} 
                      alt={document.filename}
                      className="w-full h-auto"
                    />
                  ) : document.mime_type === 'application/pdf' ? (
                    <iframe
                      src={documentUrl}
                      className="w-full h-[600px]"
                      title={document.filename}
                    />
                  ) : (
                    <div className="aspect-[8.5/11] bg-muted/50 flex items-center justify-center">
                      <div className="text-center">
                        <FileText className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                        <p className="text-muted-foreground mb-2">
                          Preview not available for this file type
                        </p>
                        <Button variant="outline" size="sm" asChild>
                          <a href={documentUrl} download={document.filename}>
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </a>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-[8.5/11] bg-muted/50 flex items-center justify-center">
                  <FileText className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Loading preview...</p>
                </div>
              )}
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
                      Intelligent extraction with AI validation
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                     {adeResult ? (
                      <div className="space-y-4">
                        {/* Source & Confidence Info */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Source badge */}
                          {adeResult.metadata && typeof adeResult.metadata === 'object' && (adeResult.metadata as any)?.source === "ade" && (
                            <Badge variant="default" className="text-xs">
                              Extracted by ADE
                            </Badge>
                          )}
                          {adeResult.metadata && typeof adeResult.metadata === 'object' && (adeResult.metadata as any)?.source === "llm_only" && (
                            <Badge variant="secondary" className="text-xs">
                              Extracted by LLM
                            </Badge>
                          )}
                          
                          {/* Recovery badge */}
                          {adeResult.metadata && typeof adeResult.metadata === 'object' && (adeResult.metadata as any)?.recovery_attempted && (adeResult.metadata as any)?.recovered_fields?.length > 0 && (
                            <Badge variant="secondary" className="gap-1">
                              <span className="text-xs">🤖</span>
                              Recovered by AI: {(adeResult.metadata as any).recovered_fields.join(", ")}
                            </Badge>
                          )}
                          
                          {/* Confidence badge with color coding */}
                          {adeResult.confidence_score !== null && (
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${
                                (adeResult.confidence_score ?? 0) >= 0.8 
                                  ? "border-green-500 text-green-700 dark:text-green-400" 
                                  : (adeResult.confidence_score ?? 0) >= 0.6 
                                  ? "border-yellow-500 text-yellow-700 dark:text-yellow-400" 
                                  : "border-red-500 text-red-700 dark:text-red-400"
                              }`}
                            >
                              Confidence: {((adeResult.confidence_score ?? 0) * 100).toFixed(0)}%
                            </Badge>
                          )}
                          
                          {/* Tax rule badge */}
                          {adeResult.metadata && typeof adeResult.metadata === 'object' && (adeResult.metadata as any)?.tax_rule && (
                            <Badge variant="secondary" className="text-xs">
                              {(adeResult.metadata as any).tax_rule === "tax_included" ? "Tax Included" : "Tax Added"}
                            </Badge>
                          )}
                        </div>
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
                        <p className="text-sm mb-4">Process this document to extract data</p>
                        {document.status === 'uploaded' && (
                          <Button 
                            onClick={async () => {
                              await supabase.functions.invoke('parse-document', {
                                body: { documentId: document.id }
                              });
                              toast({ 
                                title: "Extracting data...",
                                description: "Document parsing started"
                              });
                              refetch();
                            }}
                            size="sm"
                          >
                            Extract Data Now
                          </Button>
                        )}
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
                      {pushJob && (
                        <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                          <div className={`h-2 w-2 rounded-full ${
                            pushJob.status === 'success' ? 'bg-green-500' : 
                            pushJob.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'
                          }`}></div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              Pushed to {pushJob.connections?.display_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(pushJob.created_at).toLocaleString()} · {pushJob.status}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/jobs')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {record && record.status === "pending_review" && !pushJob && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle className="text-sm">Ready to Push</CardTitle>
                  <CardDescription>
                    Review the extracted data and push to your ERP system
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Select Connection</label>
                      <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Choose a connection" />
                        </SelectTrigger>
                        <SelectContent>
                          {connections?.map((conn) => (
                            <SelectItem key={conn.id} value={conn.id}>
                              {conn.display_name} ({conn.adapter})
                              {conn.is_default && " (Default)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        variant="outline"
                        onClick={handlePreviewPayload}
                        disabled={!selectedConnection}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Preview Payload
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => setShowPushDialog(true)}
                        disabled={!selectedConnection}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Approve & Push
                      </Button>
                    </div>
                    {!connections?.length && (
                      <div className="text-center p-4 border border-dashed rounded-lg">
                        <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm font-medium mb-1">No Active Connections</p>
                        <p className="text-xs text-muted-foreground mb-3">
                          Set up a connection to push records to your ERP system
                        </p>
                        <Button variant="default" size="sm" onClick={() => navigate('/connections')}>
                          Configure Connections
                        </Button>
                      </div>
                    )}
                    {connections && connections.length > 0 && !connections.some(c => c.is_default) && (
                      <div className="text-xs text-muted-foreground text-center p-2 bg-muted rounded">
                        💡 Tip: Set a default connection for faster approvals
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payload Preview</DialogTitle>
            <DialogDescription>
              This is the data that will be sent to {previewPayload?.connection?.displayName}
            </DialogDescription>
          </DialogHeader>
          {previewPayload && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {previewPayload.connection.adapter}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {previewPayload.connection.displayName}
                </span>
              </div>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-96">
                {JSON.stringify(previewPayload.payload, null, 2)}
              </pre>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Push Confirmation Dialog */}
      <Dialog open={showPushDialog} onOpenChange={setShowPushDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve and Push</DialogTitle>
            <DialogDescription>
              This will approve the record and push it to your selected ERP connection.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPushDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleApproveAndPush} disabled={pushing}>
              {pushing ? "Pushing..." : "Confirm & Push"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default DocumentDetail;
