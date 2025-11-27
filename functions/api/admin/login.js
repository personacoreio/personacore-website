// functions/api/admin/login.js
// Handles admin login

export async function onRequestPost(context) {
  const { email, password } = await context.request.json();
  
  try {
    // Call Supabase auth
    const response = await fetch(`${context.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': context.env.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error_description || data.msg }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data), {
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
