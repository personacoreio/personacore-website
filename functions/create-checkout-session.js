import { Stripe } from 'https://esm.sh/stripe@latest'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'))

export async function handler(req) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }})
  }

  try {
    const { price_id, fan_id, creator_slug } = await req.json()
    
    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: price_id, quantity: 1 }],
      mode: 'subscription',
      success_url: `${req.headers.get('origin')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get('origin')}/join/${creator_slug}`,
      client_reference_id: fan_id,
      metadata: {
        creator_slug: creator_slug,
        fan_id: fan_id
      }
    })

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
}