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
      const subscriptionId = session.subscription;
      
      console.log('Processing subscription:', { fanEmail, creatorSlug, subscriptionId });
      
      if (!fanEmail || !creatorSlug) {
        throw new Error('Missing email or creator_slug in session');
      }
      
      // AUTO-GENERATE unique username from email
      const baseUsername = fanEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const randomSuffix = Math.floor(1000 + Math.random() * 9000); // 4 digits
      const username = `${baseUsername}_${randomSuffix}`;
      
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
      console.log('Auto-generated username:', username);
      
      // Debug: Check if env vars are set
      console.log('Supabase URL:', env.SUPABASE_URL);
      console.log('Service role key exists:', !!env.SUPABASE_SERVICE_ROLE_KEY);
      console.log('Service role key length:', env.SUPABASE_SERVICE_ROLE_KEY?.length);
      
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
        console.log('Attempting to create user with email:', fanEmail);
        
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
        
        console.log('Create user result:', { 
          success: !!newUser, 
          hasError: !!authError,
          errorDetails: authError 
        });
        
        // Supabase sometimes returns success:true AND error:true
        // If we got user data, consider it successful
        if (authError && !newUser?.user) {
          console.error('Auth error details:', JSON.stringify(authError));
          throw new Error(`Failed to create user: ${authError.message || authError.error_description || JSON.stringify(authError)}`);
        }
        
        if (newUser?.user) {
          userId = newUser.user.id;
          console.log('Created new user:', userId);
        } else {
          throw new Error('User creation failed: no user data returned');
        }
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
      // Get actual subscription object from Stripe for accurate dates
      const stripeSubscription = session.subscription ? 
        await (async () => {
          try {
            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(env.STRIPE_SECRET_KEY);
            return await stripe.subscriptions.retrieve(session.subscription);
          } catch (e) {
            console.error('Failed to retrieve subscription:', e);
            return null;
          }
        })() : null;
      
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
      } else {
        console.log('Magic link generated for:', fanEmail);
        
        // Get the magic link URL
        const magicLinkUrl = magicLinkData?.properties?.action_link;
        
        if (magicLinkUrl) {
          console.log('Magic link URL:', magicLinkUrl);
          
          // Send email via Resend API
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
              console.log('Magic link email sent successfully to:', fanEmail);
            } else {
              const emailError = await emailResponse.json();
              console.error('Failed to send magic link email:', emailError);
            }
          } catch (emailError) {
            console.error('Error sending magic link email:', emailError);
          }
        }
      }
      
      // 8. Create payout record
      const subscriptionAmount = 5.00;
      const payoutAmount = subscriptionAmount * 0.70; // 70% to creator
      const commissionAmount = subscriptionAmount * 0.30; // 30% platform fee
      
      const { error: payoutError } = await supabase
        .from('creator_payouts')
        .insert({
          creator_id: creator.id,
          payout_amount: payoutAmount, // Required field
          commission_amount: commissionAmount, // Required field
          total_revenue: subscriptionAmount,
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
