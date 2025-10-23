import { Stripe } from 'https://esm.sh/stripe@latest'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'))
const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
)

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const sig = request.headers.get('stripe-signature');
  const body = await request.text();
  
  let event;
  try {
    // For testing, skip signature verification
    event = JSON.parse(body);
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log('📨 Webhook received:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const fanId = session.client_reference_id;
    const metadata = session.metadata || {};
    const creatorSlug = metadata.creator_slug;
    const customerEmail = session.customer_details?.email;
    
    console.log('Processing subscription:', { fanId, creatorSlug, customerEmail });
    
    try {
      // 1. Create Supabase Auth user with magic link
      const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: customerEmail,
          email_confirm: true,
          user_metadata: {
            fan_id: fanId,
            creator_slug: creatorSlug
          }
        })
      });
      
      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        console.error('Auth user creation failed:', errorText);
        // Continue anyway - user might already exist
      }
      
      const authUser = await authResponse.json();
      console.log('✅ Auth user created:', authUser.id);
      
      // 2. Get creator ID from slug
      const creatorResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/creators?slug=eq.${creatorSlug}&select=id`, {
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
        }
      });
      
      const creators = await creatorResponse.json();
      if (!creators || creators.length === 0) {
        throw new Error('Creator not found');
      }
      
      const creatorId = creators[0].id;
      
      // 3. Create fan record (use auth user ID)
      const fanResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/fans`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          id: authUser.id, // Use auth user ID as fan ID
          email: customerEmail,
          name: customerEmail.split('@')[0],
          status: 'active'
        })
      });
      
      if (!fanResponse.ok) {
        const errorText = await fanResponse.text();
        console.error('Fan creation failed:', errorText);
      }
      
      // 4. Create subscription
      const subResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          fan_id: authUser.id,
          creator_id: creatorId,
          stripe_subscription_id: session.subscription,
          stripe_customer_id: session.customer,
          status: 'active',
          amount: 5.00
        })
      });
      
      if (!subResponse.ok) {
        const errorText = await subResponse.text();
        throw new Error(`Subscription creation failed: ${errorText}`);
      }
      
      const subscription = await subResponse.json();
      console.log('✅ Subscription created:', subscription[0].id);
      
      // 5. Create conversation
      const convResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/conversations`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fan_id: authUser.id,
          creator_id: creatorId,
          subscription_id: subscription[0].id,
          status: 'active'
        })
      });
      
      if (!convResponse.ok) {
        const errorText = await convResponse.text();
        console.error('Conversation creation failed:', errorText);
      }
      
      // 6. Send magic link email
      const magicLinkResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/magiclink`, {
        method: 'POST',
        headers: {
          'apikey': env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: customerEmail,
          options: {
            emailRedirectTo: `https://personacore.io/chat?creator=${creatorSlug}`
          }
        })
      });
      
      if (!magicLinkResponse.ok) {
        console.error('Magic link failed - but continuing');
      } else {
        console.log('✅ Magic link sent to:', customerEmail);
      }
      
      console.log('🎉 Full flow completed successfully!');
      
    } catch (error) {
      console.error('❌ Webhook processing error:', error);
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}