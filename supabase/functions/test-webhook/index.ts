import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, secret } = await req.json();

    if (!url || !secret) {
      throw new Error('URL and secret are required');
    }

    // Create sample payload
    const payload = {
      record_id: crypto.randomUUID(),
      record_type: 'invoice',
      data: {
        vendor_name: 'Test Vendor',
        invoice_number: 'TEST-001',
        invoice_date: new Date().toISOString().split('T')[0],
        total: 100.00,
        currency: 'USD',
      },
      timestamp: new Date().toISOString(),
    };

    // Create HMAC signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(JSON.stringify(payload));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('Sending test webhook to:', url);

    // Send webhook request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': `sha256=${signatureHex}`,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    console.log('Webhook response:', response.status, responseText);

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${responseText}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        status: response.status,
        response: responseText,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Test webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
