
// UrbanGate Edge Logic: send-push
// This script runs in Deno on Supabase Edge Functions.

declare const Deno: any;

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import WebPush from "https://esm.sh/web-push@3.6.4"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { record: visitor } = await req.json()

    if (!visitor || visitor.status !== 'WAITING_APPROVAL') {
      return new Response(JSON.stringify({ message: 'Ignore: Not a waiting visitor' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const { data: profile, error: profileErr } = await supabaseClient
      .from('profiles')
      .select('push_subscription, telegram_chat_id, full_name')
      .eq('building_id', visitor.building_id)
      .eq('flat_number', visitor.flat_number)
      .maybeSingle()

    if (profileErr || (!profile?.push_subscription && !profile?.telegram_chat_id)) {
      console.log(`No notification channels active for Unit ${visitor.flat_number}`)
      return new Response(JSON.stringify({ message: 'No active notification channel' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // CHANNEL 1: WEB PUSH
    if (profile.push_subscription) {
      try {
        WebPush.setVapidDetails(
          'mailto:admin@urbangate.internal',
          Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
          Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
        )

        const pushPayload = JSON.stringify({
          title: 'UrbanGate: Visitor Arrival',
          body: `${visitor.name} is at the gate for ${visitor.purpose}.`,
          visitorId: visitor.id,
          action: 'intercom_request'
        })

        await WebPush.sendNotification(profile.push_subscription, pushPayload)
        console.log('Web Push sent successfully')
      } catch (err) {
        console.error('Web Push delivery failed:', err)
      }
    }

    // CHANNEL 2: TELEGRAM API
    if (profile.telegram_chat_id) {
      try {
        const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN')
        if (tgToken) {
          const message = `🔔 *UrbanGate Arrival*\n\n*Guest:* ${visitor.name}\n*Purpose:* ${visitor.purpose}\n*Action:* Please open your app to approve or deny entry.`
          
          const response = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: profile.telegram_chat_id,
              text: message,
              parse_mode: 'Markdown'
            })
          })
          
          const resData = await response.json()
          if (!resData.ok) throw new Error(resData.description)
          console.log('Telegram message sent successfully')
        }
      } catch (err) {
        console.error('Telegram delivery failed:', err)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    console.error('Edge Failure:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
