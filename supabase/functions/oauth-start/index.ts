import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OAuth configuration for different adapters
const OAUTH_CONFIGS: Record<string, any> = {
  quickbooks: {
    authEndpoint: 'https://appcenter.intuit.com/connect/oauth2',
    scopes: 'com.intuit.quickbooks.accounting',
    responseType: 'code',
  },
  xero: {
    authEndpoint: 'https://login.xero.com/identity/connect/authorize',
    scopes: 'accounting.transactions offline_access',
    responseType: 'code',
  },
  netsuite: {
    // NetSuite uses OAuth 1.0 or Token Auth, not OAuth 2.0
    // This would need custom implementation
    authEndpoint: null,
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { adapter, displayName } = await req.json();

    if (!adapter || !OAUTH_CONFIGS[adapter]) {
      throw new Error('Invalid adapter');
    }

    const config = OAUTH_CONFIGS[adapter];

    if (!config.authEndpoint) {
      throw new Error(`OAuth not supported for ${adapter}`);
    }

    // Generate state token for CSRF protection
    const state = crypto.randomUUID();
    
    // In production, you'd need to:
    // 1. Store state in a session or database
    // 2. Get actual client_id from secrets
    // 3. Handle the callback properly

    const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`;
    
    // Build authorization URL
    const params = new URLSearchParams({
      client_id: 'YOUR_CLIENT_ID', // This should come from secrets
      scope: config.scopes,
      redirect_uri: callbackUrl,
      response_type: config.responseType,
      state: state,
    });

    const authUrl = `${config.authEndpoint}?${params.toString()}`;

    console.log('Starting OAuth flow for', adapter, 'with display name:', displayName);
    console.log('Auth URL:', authUrl);

    // For MVP, return mock success since we don't have real OAuth credentials
    return new Response(
      JSON.stringify({
        message: `OAuth flow for ${adapter} is configured but requires real credentials. This is a mock response for MVP.`,
        authUrl: null, // Set to null to prevent redirect in mock mode
        adapter,
        displayName,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('OAuth start error:', error);
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
