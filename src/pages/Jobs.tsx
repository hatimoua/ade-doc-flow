import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Jobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchJobs();
  }, []);

  const fetchJobs = async () => {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .single();

      if (!profile?.organization_id) return;

      const { data, error } = await supabase
        .from("push_jobs")
        .select(`
          *,
          records (
            id,
            record_type,
            documents (
              filename
            )
          ),
          connections (
            display_name,
            adapter
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setJobs(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      queued: "secondary",
      running: "default",
      success: "default",
      failed: "destructive",
    };

    return (
      <Badge variant={variants[status] || "outline"}>
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Push Jobs</h1>
          <p className="text-muted-foreground">
            Track all record push operations to connected ERPs
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No push jobs yet. Approve a record to create your first job.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Connection</TableHead>
                    <TableHead>Adapter</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        {format(new Date(job.created_at), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium">
                        {job.records?.documents?.filename || "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {job.records?.record_type || "invoice"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {job.connections?.display_name || "N/A"}
                      </TableCell>
                      <TableCell className="capitalize">
                        {job.connections?.adapter || "N/A"}
                      </TableCell>
                      <TableCell>{getStatusBadge(job.status)}</TableCell>
                      <TableCell>
                        {job.started_at && job.completed_at
                          ? `${Math.round(
                              (new Date(job.completed_at).getTime() -
                                new Date(job.started_at).getTime()) /
                                1000
                            )}s`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedJob(job)}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Job Details</DialogTitle>
          </DialogHeader>
          {selectedJob && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <p className="mt-1">{getStatusBadge(selectedJob.status)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Adapter</p>
                  <p className="mt-1 capitalize">
                    {selectedJob.connections?.adapter}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="mt-1">
                    {format(new Date(selectedJob.created_at), "PPpp")}
                  </p>
                </div>
                {selectedJob.completed_at && (
                  <div>
                    <p className="text-sm font-medium">Completed</p>
                    <p className="mt-1">
                      {format(new Date(selectedJob.completed_at), "PPpp")}
                    </p>
                  </div>
                )}
              </div>

              {selectedJob.error_message && (
                <div>
                  <p className="text-sm font-medium text-destructive">Error</p>
                  <p className="mt-1 text-sm bg-destructive/10 p-3 rounded">
                    {selectedJob.error_message}
                  </p>
                </div>
              )}

              {selectedJob.request_payload && (
                <div>
                  <p className="text-sm font-medium">Request Payload</p>
                  <pre className="mt-1 text-xs bg-muted p-3 rounded overflow-x-auto">
                    {JSON.stringify(selectedJob.request_payload, null, 2)}
                  </pre>
                </div>
              )}

              {selectedJob.response_payload && (
                <div>
                  <p className="text-sm font-medium">Response</p>
                  <pre className="mt-1 text-xs bg-muted p-3 rounded overflow-x-auto">
                    {JSON.stringify(selectedJob.response_payload, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
