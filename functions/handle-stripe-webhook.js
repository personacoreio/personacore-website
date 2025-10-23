import { Stripe } from 'https://esm.sh/stripe@latest'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'))
const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
)

export async function handler(req) {
  const sig = req.headers.get('stripe-signature')
  const body = await req.text()
  
  let event
  try {
    event = stripe.webhooks.constructEvent(body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET'))
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const fanId = session.metadata.fan_id
    const creatorSlug = session.metadata.creator_slug
    
    console.log('Processing subscription for:', { fanId, creatorSlug })
    
    try {
      // Get creator ID from slug
      const { data: creator, error: creatorError } = await supabase
        .from('creators')
        .select('id')
        .eq('slug', creatorSlug)
        .single()

      if (creatorError) throw creatorError
      if (!creator) throw new Error('Creator not found')

      // 1. Create subscription
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .insert([{
          fan_id: fanId,
          creator_id: creator.id,
          stripe_subscription_id: session.subscription,
          status: 'active'
        }])
        .select()
        .single()

      if (subError) throw subError

      // 2. Create conversation with subscription_id
      const { error: convError } = await supabase
        .from('conversations')
        .insert([{
          fan_id: fanId,
          creator_id: creator.id,
          subscription_id: subscription.id
        }])

      if (convError) throw convError

      // 3. Create payout record
      const { error: payoutError } = await supabase
        .from('creator_payouts')
        .insert([{
          creator_id: creator.id,
          amount: 3.50,
          stripe_payment_intent_id: session.payment_intent,
          status: 'pending'
        }])

      if (payoutError) throw payoutError

      console.log('Successfully created subscription and conversation')

    } catch (error) {
      console.error('Webhook processing error:', error)
      return new Response(JSON.stringify({ error: error.message }), { status: 500 })
    }
  }

  return new Response(JSON.stringify({ received: true }))
}