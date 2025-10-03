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
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const realmId = url.searchParams.get('realmId'); // QuickBooks company ID

    if (!code || !state) {
      throw new Error('Missing code or state parameter');
    }

    console.log('OAuth callback received:', { code, state, realmId });

    // In production, you would:
    // 1. Verify state matches what was stored
    // 2. Exchange code for access token
    // 3. Store tokens in database
    // 4. Update connection status to 'active'

    // For MVP, redirect back to connections page
    const baseUrl = Deno.env.get('SUPABASE_URL') || '';
    const redirectUrl = `${baseUrl}/connections`;
    
    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    
    // Redirect to connections page with error
    const baseUrl = Deno.env.get('SUPABASE_URL') || '';
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const redirectUrl = `${baseUrl}/connections?error=${encodeURIComponent(errorMessage)}`;
    
    return new Response(null, {
      status: 302,
      headers: {
        'Location': redirectUrl,
        ...corsHeaders,
      },
    });
  }
});
