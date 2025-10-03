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
    const { credentials } = await req.json();

    const {
      accountId,
      roleId,
      consumerKey,
      consumerSecret,
      tokenKey,
      tokenSecret,
    } = credentials;

    // Validate all credentials are present
    if (!accountId || !roleId || !consumerKey || !consumerSecret || !tokenKey || !tokenSecret) {
      throw new Error('All NetSuite credentials are required');
    }

    console.log('Testing NetSuite connection for account:', accountId);

    // In production, you would:
    // 1. Make a test API call to NetSuite using OAuth 1.0 signing
    // 2. Verify the credentials work
    // 3. Return success/failure

    // For MVP, validate format and return mock success
    if (accountId.length < 3) {
      throw new Error('Invalid account ID format');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'NetSuite credentials validated successfully (mock)',
        accountId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('NetSuite test error:', error);
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
