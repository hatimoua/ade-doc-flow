import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const csvSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  format: z.enum(["invoice_v1", "custom"]),
  delimiter: z.enum([",", ";", "|", "\t"]),
  decimalSeparator: z.enum([".", ","]),
});

type CsvFormData = z.infer<typeof csvSchema>;

type CsvFormProps = {
  connection: any;
  onSuccess: () => void;
  onCancel: () => void;
};

export const CsvForm = ({ connection, onSuccess, onCancel }: CsvFormProps) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<CsvFormData>({
    resolver: zodResolver(csvSchema),
    defaultValues: {
      displayName: connection?.display_name || "",
      format: connection?.meta?.format || "invoice_v1",
      delimiter: connection?.meta?.delimiter || ",",
      decimalSeparator: connection?.meta?.decimalSeparator || ".",
    },
  });

  const onSubmit = async (data: CsvFormData) => {
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
        adapter: "csv" as const,
        display_name: data.displayName,
        status: "active" as const,
        meta: {
          format: data.format,
          delimiter: data.delimiter,
          decimalSeparator: data.decimalSeparator,
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

      toast({ title: "CSV connection saved" });
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

  const handleDownloadSample = () => {
    const sampleData = [
      ["vendor_name", "invoice_number", "invoice_date", "total", "currency"],
      ["Acme Corp", "INV-001", "2025-01-15", "1250.50", "USD"],
      ["Tech Solutions", "INV-002", "2025-01-16", "3400.00", "USD"],
    ];

    const delimiter = watch("delimiter");
    const csv = sampleData.map((row) => row.join(delimiter)).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample_invoice.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="displayName">Display Name</Label>
          <Input
            id="displayName"
            {...register("displayName")}
            placeholder="My CSV Export"
          />
          {errors.displayName && (
            <p className="text-sm text-destructive mt-1">
              {errors.displayName.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="format">CSV Format</Label>
          <Select
            value={watch("format")}
            onValueChange={(value) => setValue("format", value as any)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="invoice_v1">Invoice v1 (Standard)</SelectItem>
              <SelectItem value="custom">Custom Format</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="delimiter">Delimiter</Label>
            <Select
              value={watch("delimiter")}
              onValueChange={(value) => setValue("delimiter", value as any)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select delimiter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=",">Comma (,)</SelectItem>
                <SelectItem value=";">Semicolon (;)</SelectItem>
                <SelectItem value="|">Pipe (|)</SelectItem>
                <SelectItem value="\t">Tab</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="decimalSeparator">Decimal Separator</Label>
            <Select
              value={watch("decimalSeparator")}
              onValueChange={(value) =>
                setValue("decimalSeparator", value as any)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select separator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=".">Dot (.)</SelectItem>
                <SelectItem value=",">Comma (,)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-4 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-2">
            CSV exports will be generated when you approve records and can be
            downloaded from the Push Jobs page.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadSample}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Sample CSV
          </Button>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
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
