import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { documentId } = await req.json();
    console.log("Parsing document:", documentId);

    // Update status to parsing
    await supabaseClient
      .from("documents")
      .update({ status: "parsing" })
      .eq("id", documentId);

    // Get document details
    const { data: document, error: docError } = await supabaseClient
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError) throw docError;

    // Download file from storage
    const { data: fileData, error: storageError } = await supabaseClient.storage
      .from("documents")
      .download(document.storage_path);

    if (storageError) throw storageError;

    // Simple text extraction (enhance with proper parsers later)
    const text = await fileData.text();
    
    // Mock ADE extraction for demo
    const adeResult = {
      invoice_number: `INV-${Math.floor(Math.random() * 10000)}`,
      invoice_date: new Date().toISOString().split('T')[0],
      vendor: "Sample Vendor Corp",
      total_amount: (Math.random() * 10000).toFixed(2),
      currency: "USD",
      line_items: [
        {
          description: "Sample Item 1",
          quantity: 1,
          unit_price: (Math.random() * 1000).toFixed(2),
        }
      ]
    };

    // Create ADE result
    const { data: adeData, error: adeError } = await supabaseClient
      .from("ade_results")
      .insert({
        document_id: documentId,
        ade_json: adeResult,
        confidence_score: 0.95,
        metadata: { parsed_at: new Date().toISOString() }
      })
      .select()
      .single();

    if (adeError) throw adeError;

    // Create record from ADE result
    const { data: record, error: recordError } = await supabaseClient
      .from("records")
      .insert({
        document_id: documentId,
        organization_id: document.organization_id,
        record_type: document.doc_type,
        status: "pending_review",
        normalized_data: adeResult,
      })
      .select()
      .single();

    if (recordError) throw recordError;

    // Update document status to ready
    await supabaseClient
      .from("documents")
      .update({ status: "ready" })
      .eq("id", documentId);

    console.log("Document parsed successfully:", documentId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        recordId: record.id,
        adeResultId: adeData.id 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error parsing document:", error);
    
    // Update document status to error
    if (error.documentId) {
      const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      await supabaseClient
        .from("documents")
        .update({ 
          status: "error",
          error_message: error.message 
        })
        .eq("id", error.documentId);
    }

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
