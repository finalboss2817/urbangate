
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

    const body = await req.json()
    const tgToken = Deno.env.get('TELEGRAM_BOT_TOKEN')

    // 1. Handle Telegram Callbacks (Approve/Deny from Buttons)
    if (body.callback_query) {
      const { data, message, id: callbackQueryId } = body.callback_query
      const [action, visitorId] = data.split(':')

      const status = action === 'approve' ? 'ENTERED' : 'REJECTED'
      const statusLabel = action === 'approve' ? 'APPROVED ✅' : 'DENIED ❌'

      // Update Database
      const { error: dbErr } = await supabaseClient
        .from('visitors')
        .update({ 
          status, 
          check_in_at: status === 'ENTERED' ? new Date().toISOString() : null 
        })
        .eq('id', visitorId)

      if (dbErr) throw dbErr

      // Notify Telegram User of Success
      if (tgToken) {
        // Answer callback to remove loading state on button
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQueryId, text: `Visitor ${statusLabel}` })
        })

        // Edit original message to show result
        const newText = `${message.text}\n\n*RESULT:* ${statusLabel}`
        await fetch(`https://api.telegram.org/bot${tgToken}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: message.chat.id,
            message_id: message.message_id,
            text: newText,
            parse_mode: 'Markdown'
          })
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // 2. Handle Supabase Webhook (Initial Notification)
    const { record: visitor } = body

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
    if (profile.telegram_chat_id && tgToken) {
      try {
        const message = `🔔 *UrbanGate Arrival*\n\n*Guest:* ${visitor.name}\n*Purpose:* ${visitor.purpose}\n\n*Action Required:* Choose an option below:`
        
        const response = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: profile.telegram_chat_id,
            text: message,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Approve Entry', callback_data: `approve:${visitor.id}` },
                  { text: '❌ Deny Entry', callback_data: `deny:${visitor.id}` }
                ]
              ]
            }
          })
        })
        
        const resData = await response.json()
        if (!resData.ok) throw new Error(resData.description)
        console.log('Telegram message sent successfully')
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
