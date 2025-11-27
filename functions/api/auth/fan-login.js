// functions/api/auth/fan-login.js
// Send magic link to fan

export async function onRequestPost(context) {
  try {
    const { email } = await context.request.json();
    
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Send magic link via Supabase Auth
    const response = await fetch(`${context.env.SUPABASE_URL}/auth/v1/otp`, {
      method: 'POST',
      headers: {
        'apikey': context.env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        options: {
          emailRedirectTo: `${new URL(context.request.url).origin}/my-chats`
        }
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error_description || data.msg || 'Failed to send magic link' }), {
        status: response.status,
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
