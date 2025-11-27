// functions/api/auth/creator-login.js
// Check creator status and send magic link

export async function onRequestPost(context) {
  try {
    const { email } = await context.request.json();
    
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // First, check if creator exists and is active
    const creatorResponse = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/creators?email=eq.${encodeURIComponent(email)}&select=id,email,status`,
      {
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const creators = await creatorResponse.json();
    
    if (!creatorResponse.ok) {
      return new Response(JSON.stringify({ error: 'Failed to check creator account' }), {
        status: creatorResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!creators || creators.length === 0) {
      return new Response(JSON.stringify({ error: 'No creator account found with this email. Please sign up first.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const creator = creators[0];

    if (creator.status !== 'active') {
      return new Response(JSON.stringify({ error: 'Your creator account is pending approval. Check your email for updates.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Creator is active, send magic link
    const authResponse = await fetch(`${context.env.SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'apikey': context.env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        options: {
          emailRedirectTo: `${new URL(context.request.url).origin}/dashboard`
        }
      })
    });

    const authData = await authResponse.json();
    
    if (!authResponse.ok) {
      return new Response(JSON.stringify({ error: authData.error_description || authData.msg || 'Failed to send magic link' }), {
        status: authResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
