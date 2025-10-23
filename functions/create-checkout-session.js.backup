export async function onRequestPost(context) {
  const { request, env } = context;
  
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  try {
    const { price_id, fan_id, creator_slug } = await request.json();
    
    // Create Stripe checkout session
    const params = new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price]': price_id,
      'line_items[0][quantity]': '1',
      'success_url': `https://personacore.io/success?session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `https://personacore.io/join/${creator_slug}`,
      'client_reference_id': fan_id,
      'metadata[creator_slug]': creator_slug,
      'metadata[fan_id]': fan_id,
      'subscription_data[metadata][creator_slug]': creator_slug,
      'subscription_data[metadata][fan_id]': fan_id,
    });

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!stripeResponse.ok) {
      const error = await stripeResponse.text();
      throw new Error(`Stripe error: ${error}`);
    }

    const session = await stripeResponse.json();

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    console.error('Checkout error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}