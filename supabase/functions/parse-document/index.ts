import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const LANDINGAI_API_KEY = Deno.env.get("LANDINGAI_API_KEY");
const ADE_PARSE_URL = "https://api.va.landing.ai/v1/ade/parse";
const ADE_EXTRACT_URL = "https://api.va.landing.ai/v1/ade/extract";

// Document schemas
const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    merchant_name: { type: "string" },
    merchant_address: { type: "string" },
    merchant_phone: { type: "string" },
    datetime: { type: "string" },
    currency: { type: "string", default: "CAD" },
    subtotal: { type: "number" },
    tps: { type: "number" },
    tvq: { type: "number" },
    total: { type: "number" },
    payment_method: { type: "string" },
    card_last4: { type: "string" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unit_price: { type: "number" },
          amount: { type: "number" }
        }
      }
    },
    tax_ids: {
      type: "object",
      properties: {
        tps: { type: "string" },
        tvq: { type: "string" }
      }
    }
  },
  required: ["merchant_name", "total"]
};

const INVOICE_SCHEMA = {
  type: "object",
  properties: {
    vendor_name: { type: "string" },
    invoice_number: { type: "string" },
    invoice_date: { type: "string", pattern: "\\d{4}-\\d{2}-\\d{2}" },
    due_date: { type: "string" },
    po_number: { type: "string" },
    currency: { type: "string", default: "USD" },
    subtotal: { type: "number" },
    tax: { type: "number" },
    total: { type: "number" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unit_price: { type: "number" },
          amount: { type: "number" }
        }
      }
    }
  },
  required: ["vendor_name", "invoice_number", "total"]
};

// ========================================
// 1) CLASSIFY DOCUMENT TYPE
// ========================================
async function classifyDocument(markdown: string): Promise<string> {
  const lowerText = markdown.toLowerCase();
  
  if (lowerText.includes("facture") || lowerText.includes("invoice")) {
    return "invoice";
  } else if (lowerText.includes("reçu") || lowerText.includes("receipt")) {
    return "receipt";
  }
  
  return "receipt"; // Default to receipt for images
}

// ========================================
// 2) ADE PARSE - Extract Markdown
// ========================================
async function parseDocumentWithADE(fileBuffer: ArrayBuffer, mimeType: string, filename: string): Promise<string> {
  if (!LANDINGAI_API_KEY) {
    console.warn("LANDINGAI_API_KEY not configured, using fallback");
    return fallbackMarkdownExtraction(fileBuffer, mimeType);
  }

  try {
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });
    formData.append("file", blob, filename);

    const response = await fetch(ADE_PARSE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LANDINGAI_API_KEY}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ADE Parse failed: ${response.status} - ${errorText}`);
      return fallbackMarkdownExtraction(fileBuffer, mimeType);
    }

    const result = await response.json();
    const markdown = result.markdown || result.text || "";
    console.log("ADE Parse successful, markdown length:", markdown.length);
    return markdown || fallbackMarkdownExtraction(fileBuffer, mimeType);
  } catch (error) {
    console.error("ADE Parse error:", error);
    return fallbackMarkdownExtraction(fileBuffer, mimeType);
  }
}

function fallbackMarkdownExtraction(fileBuffer: ArrayBuffer, mimeType: string): string {
  console.log("Using fallback text extraction");
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const text = decoder.decode(fileBuffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0).slice(0, 100);
  return lines.join("\n");
}

// ========================================
// 3) ADE EXTRACT - Get Structured Data
// ========================================
async function extractWithADE(markdown: string, docType: string): Promise<any> {
  if (!LANDINGAI_API_KEY) {
    console.warn("LANDINGAI_API_KEY not configured, using LLM");
    return extractWithLLM(markdown, docType, false, []);
  }

  try {
    const schema = docType === "receipt" ? RECEIPT_SCHEMA : INVOICE_SCHEMA;

    const response = await fetch(ADE_EXTRACT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LANDINGAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        markdown: markdown,
        schema: schema,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ADE Extract failed: ${response.status} - ${errorText}`);
      return extractWithLLM(markdown, docType, false, []);
    }

    const result = await response.json();
    console.log("ADE Extract successful");
    return result.data || result;
  } catch (error) {
    console.error("ADE Extract error:", error);
    return extractWithLLM(markdown, docType, false, []);
  }
}

// ========================================
// 4) LLM RECOVERY (only when needed)
// ========================================
async function extractWithLLM(markdown: string, docType: string, recoveryMode = false, missingFields: string[] = []): Promise<any> {
  if (!LOVABLE_API_KEY) {
    console.warn("LOVABLE_API_KEY not configured");
    return {};
  }

  const schema = docType === "receipt" ? RECEIPT_SCHEMA : INVOICE_SCHEMA;
  const schemaStr = JSON.stringify(schema, null, 2);

  let systemPrompt = `Extract data from this ${docType} document. Return valid JSON matching the schema exactly.`;
  
  if (recoveryMode && missingFields.length > 0) {
    systemPrompt = `RECOVERY MODE: Extract these missing fields from a ${docType}: ${missingFields.join(", ")}. Return valid JSON with only these fields.`;
  }

  const prompt = `Schema:\n${schemaStr}\n\nDocument:\n${markdown.slice(0, 1024)}`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_document_data",
            description: `Extract ${docType} data`,
            parameters: schema
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_document_data" } },
        temperature: 0
      }),
    });

    if (!res.ok) {
      console.error("LLM error:", res.status, await res.text());
      return {};
    }

    const json = await res.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const data = JSON.parse(toolCall.function.arguments);
      
      // Redact PANs
      if (data.card_number) {
        const digits = data.card_number.replace(/\D/g, "");
        data.card_last4 = digits.slice(-4);
        delete data.card_number;
      }
      
      console.log("LLM extraction successful:", recoveryMode ? "recovery" : "full");
      return data;
    }

    return {};
  } catch (err) {
    console.error("LLM extraction failed:", err);
    return {};
  }
}

// ========================================
// 5) NORMALIZATION HELPERS
// ========================================
function normalizeNumbers(data: any): any {
  const normalized = { ...data };
  
  for (const key of Object.keys(normalized)) {
    const val = normalized[key];
    if (typeof val === 'string' && /^[\d\s,.]+$/.test(val)) {
      const cleaned = val.replace(/\s/g, '').replace(',', '.');
      const num = parseFloat(cleaned);
      if (!isNaN(num)) normalized[key] = num;
    }
  }
  
  return normalized;
}

function normalizeDate(data: any): any {
  const normalized = { ...data };
  
  for (const key of ['datetime', 'invoice_date', 'due_date']) {
    const val = normalized[key];
    if (!val) continue;
    
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) continue; // Already normalized
    
    const parts = val.split(/[\/\-\.]/);
    if (parts.length === 3) {
      const [a, b, c] = parts.map((p: string) => parseInt(p, 10));
      if (c > 1900 && b <= 12 && a <= 31) {
        normalized[key] = `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
      }
    }
  }
  
  return normalized;
}

// ========================================
// 6) VALIDATION
// ========================================
function validateTotals(data: any, markdown: string): { valid: boolean; rule: string; confidence: number } {
  const lowerMarkdown = markdown.toLowerCase();
  const isTaxIncluded = lowerMarkdown.includes("tps incluse") || lowerMarkdown.includes("taxes incluses") || lowerMarkdown.includes("tvq incluse");
  
  const subtotal = data.subtotal || 0;
  const tps = data.tps || 0;
  const tvq = data.tvq || 0;
  const total = data.total || 0;
  
  let expectedTotal: number;
  let rule: string;
  
  if (isTaxIncluded) {
    expectedTotal = total;
    rule = "tax_included";
  } else {
    expectedTotal = subtotal + tps + tvq;
    rule = "tax_added";
  }
  
  const diff = Math.abs(total - expectedTotal);
  const valid = diff < 0.02;
  const confidence = valid ? 0.95 : (diff < 0.5 ? 0.7 : 0.4);
  
  return { valid, rule, confidence };
}

function calculateConfidence(data: any, schema: any, validation: any): number {
  let score = 0.5;
  
  const requiredFields = schema.required || [];
  const presentFields = requiredFields.filter((f: string) => data[f] !== null && data[f] !== undefined);
  const fieldScore = presentFields.length / requiredFields.length;
  score += fieldScore * 0.3;
  
  if (validation?.valid) {
    score += 0.2;
  }
  
  return Math.min(score, 1.0);
}

// ========================================
// 7) POST-PROCESSING & RECOVERY
// ========================================
async function postProcess(data: any, markdown: string, docType: string, source: string) {
  const schema = docType === "receipt" ? RECEIPT_SCHEMA : INVOICE_SCHEMA;
  
  // Set default currency
  if (!data.currency) {
    data.currency = docType === "receipt" ? "CAD" : "USD";
  }

  // Normalize
  data = normalizeNumbers(data);
  data = normalizeDate(data);

  // Validate
  let validation = docType === "receipt" ? validateTotals(data, markdown) : null;
  let confidence = calculateConfidence(data, schema, validation);

  // Check if recovery needed
  const required = schema.required || [];
  const missing = required.filter((f: string) => !data[f]);
  const needsRecovery = confidence < 0.6 || missing.length > 0;

  let recoveredFields: string[] = [];
  let recoverySource = "";

  if (needsRecovery) {
    console.log(`Triggering LLM recovery (confidence: ${confidence.toFixed(2)}, missing: ${missing.join(", ")})`);
    const recoveredData = await extractWithLLM(markdown, docType, true, missing);
    
    // Merge recovered fields
    for (const field of missing) {
      if (recoveredData[field]) {
        data[field] = recoveredData[field];
        recoveredFields.push(field);
      }
    }
    
    if (recoveredFields.length > 0) {
      recoverySource = "llm";
      
      // Re-normalize and validate
      data = normalizeNumbers(data);
      data = normalizeDate(data);
      validation = docType === "receipt" ? validateTotals(data, markdown) : null;
      confidence = calculateConfidence(data, schema, validation);
      
      console.log(`Recovery completed: ${recoveredFields.join(", ")} (new confidence: ${confidence.toFixed(2)})`);
    }
  }

  return {
    data,
    confidence,
    validation,
    metadata: {
      source: source,
      doc_type: docType,
      tax_rule: validation?.rule || null,
      parsed_at: new Date().toISOString(),
      recovery_attempted: recoveredFields.length > 0,
      recovered_fields: recoveredFields,
      recovery_source: recoverySource,
    },
  };
}

// ========================================
// 8) MAIN HANDLER
// ========================================
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
    console.log("=== Starting document processing:", documentId);

    // Update status to parsing
    await supabaseClient
      .from("documents")
      .update({ status: "parsing" })
      .eq("id", documentId);

    // Get document
    const { data: document, error: docError } = await supabaseClient
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .single();

    if (docError) throw docError;

    // Step 1: Download file
    console.log("Step 1: Downloading file...");
    const { data: fileData, error: storageError } = await supabaseClient.storage
      .from("documents")
      .download(document.storage_path);

    if (storageError) throw storageError;

    const fileBuffer = await fileData.arrayBuffer();
    console.log("File downloaded, size:", fileBuffer.byteLength);

    // Step 2: ADE Parse - Extract markdown
    console.log("Step 2: Parsing with ADE...");
    const markdown = await parseDocumentWithADE(fileBuffer, document.mime_type, document.filename);
    console.log("Markdown extracted, length:", markdown.length);

    // Step 3: Classify
    const docType = document.doc_type || (await classifyDocument(markdown));
    console.log("Step 3: Document type:", docType);

    if (!document.doc_type) {
      await supabaseClient
        .from("documents")
        .update({ doc_type: docType })
        .eq("id", documentId);
    }

    // Step 4: ADE Extract
    console.log("Step 4: Extracting with ADE...");
    const extractedData = await extractWithADE(markdown, docType);
    console.log("Extracted fields:", Object.keys(extractedData).join(", "));

    // Determine source
    const extractionSource = LANDINGAI_API_KEY ? "ade" : "llm_only";

    // Step 5: Post-process, validate, conditionally recover
    console.log("Step 5: Post-processing...");
    const result = await postProcess(extractedData, markdown, docType, extractionSource);

    // Save ADE result
    const { data: existingAde } = await supabaseClient
      .from("ade_results")
      .select("id")
      .eq("document_id", documentId)
      .maybeSingle();

    let adeData;
    if (existingAde) {
      const { data: updated, error: updateError } = await supabaseClient
        .from("ade_results")
        .update({
          markdown_content: markdown,
          ade_json: result.data,
          confidence_score: result.confidence,
          metadata: result.metadata
        })
        .eq("id", existingAde.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      adeData = updated;
    } else {
      const { data: created, error: createError } = await supabaseClient
        .from("ade_results")
        .insert({
          document_id: documentId,
          markdown_content: markdown,
          ade_json: result.data,
          confidence_score: result.confidence,
          metadata: result.metadata
        })
        .select()
        .single();
      
      if (createError) throw createError;
      adeData = created;
    }

    // Save record
    const { data: existingRecord } = await supabaseClient
      .from("records")
      .select("id")
      .eq("document_id", documentId)
      .maybeSingle();

    let record;
    if (existingRecord) {
      const { data: updated, error: updateError } = await supabaseClient
        .from("records")
        .update({
          record_type: docType,
          normalized_data: result.data,
          validation_result: result.validation
        })
        .eq("id", existingRecord.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      record = updated;
    } else {
      const { data: created, error: createError } = await supabaseClient
        .from("records")
        .insert({
          document_id: documentId,
          organization_id: document.organization_id,
          record_type: docType,
          status: "pending_review",
          normalized_data: result.data,
          validation_result: result.validation
        })
        .select()
        .single();
      
      if (createError) throw createError;
      record = created;
    }

    // Update document status
    await supabaseClient
      .from("documents")
      .update({ status: "ready" })
      .eq("id", documentId);

    console.log("=== Processing complete:", {
      docType,
      confidence: result.confidence.toFixed(2),
      recoveredFields: result.metadata.recovered_fields
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        recordId: record.id,
        adeResultId: adeData.id,
        docType,
        confidence: result.confidence,
        recoveredFields: result.metadata.recovered_fields
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("=== Error parsing document:", error);
    
    try {
      const { documentId } = await req.json();
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
        .eq("id", documentId);
    } catch {}

    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
