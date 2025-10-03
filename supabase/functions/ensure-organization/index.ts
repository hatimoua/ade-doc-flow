import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from auth header
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    console.log(`Checking organization for user ${user.id}`)

    // Check if user already has a profile with an organization
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('id, organization_id, email')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      throw profileError
    }

    // If profile exists and has an organization, return it
    if (profile?.organization_id) {
      console.log(`User already has organization: ${profile.organization_id}`)
      return new Response(
        JSON.stringify({ 
          organizationId: profile.organization_id,
          created: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Creating organization for user ${user.id}`)

    // Create a new organization
    const orgName = user.email?.split('@')[0] + "'s Organization" || "My Organization"
    const { data: newOrg, error: orgError } = await supabaseClient
      .from('organizations')
      .insert({ name: orgName })
      .select()
      .single()

    if (orgError) {
      throw orgError
    }

    console.log(`Created organization: ${newOrg.id}`)

    // Update or create profile with organization
    if (profile) {
      const { error: updateError } = await supabaseClient
        .from('profiles')
        .update({ organization_id: newOrg.id })
        .eq('id', user.id)

      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabaseClient
        .from('profiles')
        .insert({
          id: user.id,
          email: user.email!,
          organization_id: newOrg.id,
          full_name: user.user_metadata?.full_name || ''
        })

      if (insertError) throw insertError
    }

    // Assign owner role
    const { error: roleError } = await supabaseClient
      .from('user_roles')
      .insert({
        user_id: user.id,
        organization_id: newOrg.id,
        role: 'owner'
      })

    if (roleError && !roleError.message.includes('duplicate')) {
      throw roleError
    }

    console.log(`Successfully ensured organization for user ${user.id}`)

    return new Response(
      JSON.stringify({ 
        organizationId: newOrg.id,
        created: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error in ensure-organization:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
