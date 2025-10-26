import { createClient } from '@supabase/supabase-js'

export async function onRequestPost(context) {
  const { request, env } = context;
  
  console.log('🔔 Webhook received at:', new Date().toISOString());
  
  const sig = request.headers.get('stripe-signature');
  const body = await request.text();
  
  // For testing, we'll skip signature verification
  // TODO: Add proper verification in production
  
  let event;
  try {
    event = JSON.parse(body);
    console.log('✅ Event parsed:', event.type);
  } catch (err) {
    console.error('❌ Webhook JSON parse error:', err);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      console.log('💳 Processing checkout.session.completed');
      
      const session = event.data.object;
      
      // Get metadata
      const fanEmail = session.customer_details?.email;
      const creatorSlug = session.metadata?.creator_slug;
      const subscriptionId = session.subscription;
      
      console.log('📧 Fan email:', fanEmail);
      console.log('🎭 Creator slug:', creatorSlug);
      console.log('📝 Subscription ID:', subscriptionId);
      
      if (!fanEmail || !creatorSlug) {
        throw new Error('Missing email or creator_slug in session');
      }
      
      // AUTO-GENERATE unique username from email
      const baseUsername = fanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000); // 4 digits
      const username = `${baseUsername}_${randomSuffix}`;
      
      console.log('👤 Generated username:', username);
      
      // Check environment variables
      console.log('🔑 Checking env vars...');
      console.log('SUPABASE_URL exists:', !!env.SUPABASE_URL);
      console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!env.SUPABASE_SERVICE_ROLE_KEY);
      console.log('RESEND_API_KEY exists:', !!env.RESEND_API_KEY);
      
      if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY not set in environment');
      }
      
      // Initialize Supabase with SERVICE ROLE KEY (has admin permissions)
      console.log('🔌 Initializing Supabase...');
      const supabase = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      
      // 1. Get creator
      console.log('🔍 Fetching creator:', creatorSlug);
      const { data: creator, error: creatorError } = await supabase
        .from('creators')
        .select('id, name')
        .eq('slug', creatorSlug)
        .single();

      if (creatorError || !creator) {
        console.error('❌ Creator fetch error:', creatorError);
        throw new Error(`Creator not found: ${creatorSlug}`);
      }
      
      console.log('✅ Found creator:', creator.name, 'ID:', creator.id);
      
      // 2. Create Supabase Auth user (or get existing by email)
      console.log('👥 Creating/fetching auth user...');
      let userId;
      
      // Check if user already exists by email
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const userExists = existingUsers?.users?.find(u => u.email === fanEmail);
      
      if (userExists) {
        userId = userExists.id;
        console.log('✅ User already exists:', userId);
      } else {
        console.log('🆕 Creating new auth user...');
        
        // Generate a random password (user won't need it - they'll use magic links)
        const randomPassword = crypto.randomUUID() + crypto.randomUUID();
        
        const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
          email: fanEmail,
          password: randomPassword,
          email_confirm: true,
          user_metadata: {
            username: username,
            subscribed_to: creator.name
          }
        });
        
        if (authError && !newUser?.user) {
          console.error('❌ Auth error:', JSON.stringify(authError));
          throw new Error(`Failed to create user: ${authError.message || authError.error_description}`);
        }
        
        if (newUser?.user) {
          userId = newUser.user.id;
          console.log('✅ Created new user:', userId);
        } else {
          throw new Error('User creation failed: no user data returned');
        }
      }
      
      // 3. Create or update fan record with username
      console.log('💾 Creating fan record...');
      const { error: fanError } = await supabase
        .from('fans')
        .upsert({
          id: userId,
          email: fanEmail,
          username: username,
          name: username,
          status: 'active'
        });
      
      if (fanError) {
        console.error('❌ Fan upsert error:', fanError);
        throw new Error(`Failed to create fan record: ${fanError.message}`);
      }
      
      console.log('✅ Created fan with username:', username);
      
      // 4. Create subscription record
      console.log('📋 Creating subscription record...');
      
      // Get actual subscription object from Stripe for accurate dates
      let stripeSubscription = null;
      if (session.subscription && env.STRIPE_SECRET_KEY) {
        try {
          const Stripe = (await import('stripe')).default;
          const stripe = new Stripe(env.STRIPE_SECRET_KEY);
          stripeSubscription = await stripe.subscriptions.retrieve(session.subscription);
          console.log('✅ Retrieved Stripe subscription');
        } catch (e) {
          console.error('⚠️ Failed to retrieve subscription:', e);
        }
      }
      
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
          current_period_start: stripeSubscription ? 
            new Date(stripeSubscription.current_period_start * 1000).toISOString() :
            new Date().toISOString(),
          current_period_end: stripeSubscription ?
            new Date(stripeSubscription.current_period_end * 1000).toISOString() :
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single();

      if (subError) {
        console.error('❌ Subscription error:', subError);
        throw new Error(`Failed to create subscription: ${subError.message}`);
      }
      
      console.log('✅ Created subscription:', subscription.id);
      
      // 5. Create conversation
      console.log('💬 Creating conversation...');
      const { error: convError } = await supabase
        .from('conversations')
        .insert({
          fan_id: userId,
          creator_id: creator.id,
          subscription_id: subscription.id,
          status: 'active'
        });

      if (convError) {
        console.error('⚠️ Conversation creation error:', convError);
        // Don't throw - not critical
      } else {
        console.log('✅ Created conversation');
      }
      
      // 6. Send magic link email
      console.log('📧 Generating magic link...');
      const { data: magicLinkData, error: magicLinkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: fanEmail,
        options: {
          redirectTo: `https://personacore.io/chat?creator=${creatorSlug}`
        }
      });
      
      if (magicLinkError) {
        console.error('❌ Magic link error:', magicLinkError);
      } else {
        console.log('✅ Magic link generated');
        
        const magicLinkUrl = magicLinkData?.properties?.action_link;
        
        if (magicLinkUrl && env.RESEND_API_KEY) {
          console.log('📮 Sending email via Resend...');
          try {
            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: 'PersonaCore <noreply@personacore.io>',
                to: fanEmail,
                subject: `Welcome to PersonaCore - Chat with ${creator.name}`,
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #667eea;">Welcome to PersonaCore!</h2>
                    <p>You've successfully subscribed to chat with <strong>${creator.name}</strong>.</p>
                    
                    <div style="background: #f5f5f7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 0;"><strong>Your username:</strong> ${username}</p>
                      <p style="margin: 5px 0 0 0; font-size: 0.9em; color: #666;">You can change this anytime in your settings</p>
                    </div>
                    
                    <p>Click the button below to start chatting:</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${magicLinkUrl}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; font-weight: 600;">Start Chatting with ${creator.name}</a>
                    </div>
                    
                    <p style="color: #666; font-size: 0.9em;">Or copy this link: ${magicLinkUrl}</p>
                    <p style="color: #999; font-size: 0.85em;">This link will expire in 24 hours.</p>
                  </div>
                `
              })
            });
            
            if (emailResponse.ok) {
              console.log('✅ Magic link email sent successfully');
            } else {
              const emailError = await emailResponse.json();
              console.error('❌ Failed to send email:', emailError);
            }
          } catch (emailError) {
            console.error('❌ Email error:', emailError);
          }
        } else {
          console.log('⚠️ Skipping email - missing magic link URL or RESEND_API_KEY');
        }
      }
      
      // 7. Create payout record
      console.log('💰 Creating payout record...');
      const subscriptionAmount = 5.00;
      const payoutAmount = subscriptionAmount * 0.70;
      const commissionAmount = subscriptionAmount * 0.30;
      
      const { error: payoutError } = await supabase
        .from('creator_payouts')
        .insert({
          creator_id: creator.id,
          payout_amount: payoutAmount,
          commission_amount: commissionAmount,
          total_revenue: subscriptionAmount,
          stripe_payment_intent_id: session.payment_intent,
          status: 'pending',
          period_start: new Date().toISOString().split('T')[0],
          period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        });

      if (payoutError) {
        console.error('⚠️ Payout creation error:', payoutError);
      } else {
        console.log('✅ Created payout record');
      }
      
      console.log('🎉 Successfully processed subscription for:', fanEmail, 'username:', username);
    } else {
      console.log('ℹ️ Event type not handled:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('💥 Webhook processing error:', error.message);
    console.error('Stack:', error.stack);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
