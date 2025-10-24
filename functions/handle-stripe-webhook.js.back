import { createClient } from '@supabase/supabase-js'

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const sig = request.headers.get('stripe-signature');
  const body = await request.text();
  
  // For testing, we'll skip signature verification
  // TODO: Add proper verification in production
  
  let event;
  try {
    event = JSON.parse(body);
  } catch (err) {
    console.error('Webhook JSON parse error:', err);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log('Stripe webhook received:', event.type);

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // Get metadata
      const fanEmail = session.customer_details?.email;
      const creatorSlug = session.metadata?.creator_slug;
      const username = session.metadata?.username;  // NEW: Get username from metadata
      const subscriptionId = session.subscription;
      
      console.log('Processing subscription:', { fanEmail, creatorSlug, username, subscriptionId });
      
      if (!fanEmail || !creatorSlug || !username) {
        throw new Error('Missing email, creator_slug, or username in session');
      }
      
      // Initialize Supabase with SERVICE ROLE KEY (has admin permissions)
      const supabase = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      // 1. Get creator
      const { data: creator, error: creatorError } = await supabase
        .from('creators')
        .select('id, name')
        .eq('slug', creatorSlug)
        .single();

      if (creatorError || !creator) {
        throw new Error(`Creator not found: ${creatorSlug}`);
      }
      
      console.log('Found creator:', creator.name);
      
      // 2. Double-check username is still available (race condition protection)
      const { data: existingUsername } = await supabase
        .from('fans')
        .select('username')
        .eq('username', username)
        .single();
      
      if (existingUsername) {
        throw new Error(`Username ${username} was taken during checkout. Please try again with a different username.`);
      }
      
      // 3. Create Supabase Auth user (or get existing by email)
      let userId;
      
      // Check if user already exists by email
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const userExists = existingUsers?.users?.find(u => u.email === fanEmail);
      
      if (userExists) {
        userId = userExists.id;
        console.log('User already exists:', userId);
      } else {
        // Create new auth user
        const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
          email: fanEmail,
          email_confirm: true, // Auto-confirm for now
          user_metadata: {
            username: username,
            subscribed_to: creator.name
          }
        });
        
        if (authError) {
          throw new Error(`Failed to create user: ${authError.message}`);
        }
        
        userId = newUser.user.id;
        console.log('Created new user:', userId);
      }
      
      // 4. Create or update fan record with username
      const { error: fanError } = await supabase
        .from('fans')
        .upsert({
          id: userId,
          email: fanEmail,
          username: username,  // NEW: Store username
          name: username,      // Use username as display name
          status: 'active'
        });
      
      if (fanError) {
        console.error('Fan upsert error:', fanError);
        throw new Error(`Failed to create fan record: ${fanError.message}`);
      }
      
      console.log('Created fan with username:', username);
      
      // 5. Create subscription record
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .insert({
          fan_id: userId,
          creator_id: creator.id,
          stripe_subscription_id: subscriptionId,
          stripe_customer_id: session.customer,
          amount: 5.00,
          currency: 'GBP',
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (subError) {
        throw new Error(`Failed to create subscription: ${subError.message}`);
      }
      
      console.log('Created subscription:', subscription.id);
      
      // 6. Create conversation
      const { error: convError } = await supabase
        .from('conversations')
        .insert({
          fan_id: userId,
          creator_id: creator.id,
          subscription_id: subscription.id,
          status: 'active'
        });

      if (convError) {
        console.error('Conversation creation error:', convError);
        // Don't throw - not critical
      }
      
      // 7. Send magic link email
      const { data: magicLinkData, error: magicLinkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: fanEmail,
        options: {
          redirectTo: `https://personacore.io/chat?creator=${creatorSlug}`
        }
      });
      
      if (magicLinkError) {
        console.error('Magic link error:', magicLinkError);
        // For now, just log - we can manually send links during testing
      } else {
        console.log('Magic link generated for:', fanEmail);
        // The magic link URL is in: magicLinkData.properties.action_link
        // In production, you'd send this via your email service
      }
      
      // 8. Create payout record
      const payoutAmount = 5.00 * 0.70; // 70% to creator
      const { error: payoutError } = await supabase
        .from('creator_payouts')
        .insert({
          creator_id: creator.id,
          amount: payoutAmount,
          stripe_payment_intent_id: session.payment_intent,
          status: 'pending',
          period_start: new Date().toISOString().split('T')[0],
          period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        });

      if (payoutError) {
        console.error('Payout creation error:', payoutError);
      }
      
      console.log('✅ Successfully processed subscription for:', fanEmail, 'username:', username);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
