
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
        await fetch(`https://api.telegram.org/bot${tgToken}/answerCallbackQuery`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: callbackQueryId, text: `Visitor ${statusLabel}` })
        })

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
      return new Response(JSON.stringify({ message: 'No action required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // Find the resident's profile
    const { data: profile, error: profileErr } = await supabaseClient
      .from('profiles')
      .select('push_subscription, telegram_chat_id, full_name')
      .eq('building_id', visitor.building_id)
      .eq('flat_number', visitor.flat_number)
      .maybeSingle()

    if (profileErr || (!profile?.push_subscription && !profile?.telegram_chat_id)) {
      return new Response(JSON.stringify({ message: 'No active subscription' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    // CHANNEL 1: WEB PUSH
    if (profile.push_subscription) {
      WebPush.setVapidDetails(
        'mailto:admin@urbangate.internal',
        Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
        Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
      )

      const pushPayload = JSON.stringify({
        title: 'UrbanGate: Visitor Arrival',
        body: `${visitor.name} is requesting entry for ${visitor.purpose}.`,
        visitorId: visitor.id,
        action: 'intercom_request'
      })

      await WebPush.sendNotification(profile.push_subscription, pushPayload)
    }

    // CHANNEL 2: TELEGRAM
    if (profile.telegram_chat_id && tgToken) {
      const message = `🔔 *UrbanGate Arrival*\n\n*Guest:* ${visitor.name}\n*Purpose:* ${visitor.purpose}\n\n*Action Required:* Choose an option below:`
      
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
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
    }

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
