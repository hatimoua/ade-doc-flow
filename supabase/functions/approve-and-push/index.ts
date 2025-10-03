import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { recordId, connectionId, preview = false } = await req.json();

    console.log('Processing approval for record:', recordId, 'preview:', preview);

    // Fetch record
    const { data: record, error: recordError } = await supabase
      .from('records')
      .select('*, documents(*)')
      .eq('id', recordId)
      .single();

    if (recordError || !record) {
      throw new Error('Record not found');
    }

    // Fetch connection (use default if not specified)
    let connection;
    if (connectionId) {
      const { data: conn, error: connError } = await supabase
        .from('connections')
        .select('*')
        .eq('id', connectionId)
        .eq('organization_id', record.organization_id)
        .single();

      if (connError || !conn) {
        throw new Error('Connection not found');
      }
      connection = conn;
    } else {
      // Get default connection
      const { data: conn, error: connError } = await supabase
        .from('connections')
        .select('*')
        .eq('organization_id', record.organization_id)
        .eq('is_default', true)
        .single();

      if (connError || !conn) {
        throw new Error('No default connection found. Please set up a connection first.');
      }
      connection = conn;
    }

    // Validate connection is active
    if (connection.status !== 'active') {
      throw new Error('Selected connection is not active');
    }

    // Fetch field map
    const { data: fieldMap } = await supabase
      .from('field_maps')
      .select('*')
      .eq('organization_id', record.organization_id)
      .eq('doc_type', record.record_type)
      .or(`connection_id.eq.${connection.id},connection_id.is.null`)
      .order('connection_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Apply field mapping
    let payload = record.normalized_data;
    if (fieldMap?.map) {
      payload = applyFieldMap(record.normalized_data, fieldMap.map);
    }

    // If preview mode, just return the payload
    if (preview) {
      return new Response(
        JSON.stringify({ 
          payload, 
          connection: {
            id: connection.id,
            adapter: connection.adapter,
            displayName: connection.display_name
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get adapter config
    const { data: adapterConfig } = await supabase
      .from('adapter_configs')
      .select('*')
      .eq('organization_id', record.organization_id)
      .eq('adapter_type', connection.adapter)
      .eq('is_active', true)
      .maybeSingle();

    // Create push job
    const { data: pushJob, error: jobError } = await supabase
      .from('push_jobs')
      .insert({
        record_id: recordId,
        adapter_id: adapterConfig?.id,
        connection_id: connection.id,
        status: 'queued',
        request_payload: payload,
      })
      .select()
      .single();

    if (jobError || !pushJob) {
      throw new Error('Failed to create push job');
    }

    console.log('Created push job:', pushJob.id);

    // Update job to running
    await supabase
      .from('push_jobs')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', pushJob.id);

    // Execute adapter
    let result;
    try {
      if (connection.adapter === 'webhook') {
        result = await executeWebhook(payload, connection.meta, adapterConfig);
      } else if (connection.adapter === 'csv') {
        result = await executeCsv(payload, connection.meta);
      } else {
        // Mock for OAuth adapters
        result = executeMockErp(payload, connection.adapter);
      }

      // Update job to success
      await supabase
        .from('push_jobs')
        .update({
          status: 'success',
          response_payload: result,
          completed_at: new Date().toISOString(),
        })
        .eq('id', pushJob.id);

      // Update record status
      await supabase
        .from('records')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq('id', recordId);

      // Update document status
      await supabase
        .from('documents')
        .update({ status: 'pushed' })
        .eq('id', record.document_id);

      console.log('Job completed successfully');

      return new Response(
        JSON.stringify({ 
          success: true, 
          jobId: pushJob.id,
          result 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Adapter execution failed:', errorMessage);

      // Update job to failed
      await supabase
        .from('push_jobs')
        .update({
          status: 'failed',
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', pushJob.id);

      throw error;
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in approve-and-push:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

function applyFieldMap(data: any, map: any): any {
  const result: any = {};
  for (const [targetKey, sourceKey] of Object.entries(map)) {
    if (typeof sourceKey === 'string') {
      result[targetKey] = getNestedValue(data, sourceKey);
    }
  }
  return result;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

async function executeWebhook(payload: any, meta: any, adapterConfig: any): Promise<any> {
  const url = meta?.webhook_url || adapterConfig?.webhook_url;
  const secret = adapterConfig?.webhook_secret;

  if (!url) {
    throw new Error('Webhook URL not configured');
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    headers['X-Signature'] = hashHex;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  const responseData = await response.text();
  return { status: response.status, data: responseData };
}

async function executeCsv(payload: any, meta: any): Promise<any> {
  const delimiter = meta?.delimiter || ',';
  const decimal = meta?.decimal || '.';

  const headers = Object.keys(payload);
  const values = Object.values(payload).map(v => {
    if (typeof v === 'number') {
      return String(v).replace('.', decimal);
    }
    if (typeof v === 'string' && v.includes(delimiter)) {
      return `"${v}"`;
    }
    return v;
  });

  const csv = [headers.join(delimiter), values.join(delimiter)].join('\n');
  
  return {
    format: 'csv',
    content: csv,
    filename: `record_${Date.now()}.csv`,
  };
}

function executeMockErp(payload: any, adapter: string): any {
  console.log(`Mock ${adapter} push:`, payload);
  
  return {
    mockMode: true,
    adapter,
    payload,
    erpResponse: {
      id: `MOCK-${adapter.toUpperCase()}-${Date.now()}`,
      status: 'accepted',
      message: `Mock ${adapter} integration - would push to live API`,
    },
  };
}
