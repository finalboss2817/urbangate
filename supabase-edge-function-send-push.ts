
/**
 * UrbanGate Edge Logic: send-push
 * --------------------------------
 * This file is for deployment to Supabase Edge Functions.
 * 
 * SETUP:
 * 1. Generate VAPID keys.
 * 2. Set secrets in Supabase CLI:
 *    supabase secrets set VAPID_PUBLIC_KEY=your_public_key
 *    supabase secrets set VAPID_PRIVATE_KEY=your_private_key
 * 3. Deploy:
 *    supabase functions deploy send-push
 */

// Fix for "Cannot find name 'Deno'": Declare Deno as a global constant for the compiler
declare const Deno: any;

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import WebPush from "https://esm.sh/web-push@3.6.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse payload from Webhook (Step 3)
    // Payload structure comes from Supabase Webhook: { type: 'INSERT', record: { ... }, ... }
    const { record: visitor } = await req.json()

    if (!visitor || visitor.status !== 'WAITING_APPROVAL') {
      return new Response(JSON.stringify({ message: 'No action required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 1. Find the resident's profile linked to this flat
    const { data: profile, error: profileErr } = await supabaseClient
      .from('profiles')
      .select('push_subscription, full_name')
      .eq('building_id', visitor.building_id)
      .eq('flat_number', visitor.flat_number)
      .maybeSingle()

    if (profileErr || !profile?.push_subscription) {
      console.log('No valid subscription found for flat:', visitor.flat_number)
      return new Response(JSON.stringify({ message: 'No active subscription' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. Configure WebPush with your production VAPID keys
    WebPush.setVapidDetails(
      'mailto:admin@urbangate.internal',
      Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
      Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    )

    // 3. Transmit the Push Packet
    const pushPayload = JSON.stringify({
      title: 'UrbanGate: Visitor Arrival',
      body: `${visitor.name} is requesting entry for ${visitor.purpose}.`,
      visitorId: visitor.id,
      action: 'intercom_request'
    })

    await WebPush.sendNotification(
      profile.push_subscription,
      pushPayload
    )

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    // Fix: Using 'any' type in catch block to safely access error properties like 'message' and 'statusCode'
    console.error('Edge Function Error:', error.message)
    
    // Handle expired/gone subscriptions
    if (error.statusCode === 410) {
      console.warn('Subscription expired. Cleaning up database...')
      // Logic to clear push_subscription from profiles table would go here
    }

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
