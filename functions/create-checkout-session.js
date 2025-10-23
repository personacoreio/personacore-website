import Stripe from 'stripe';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const { price_id, creator_slug, username } = body;

    if (!price_id || !creator_slug || !username) {
      return new Response(
        JSON.stringify({ error: 'Missing price_id, creator_slug, or username' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: price_id,
          quantity: 1,
        },
      ],
      success_url: `${env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.BASE_URL}/join/${creator_slug}`,
      metadata: {
        creator_slug: creator_slug,
        username: username,  // NEW: Pass username to webhook
      },
    });

    return new Response(
      JSON.stringify({ url: session.url }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Stripe session creation error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
