// functions/api/admin/fan.js
// Get or create admin fan record

export async function onRequestGet(context) {
  const authHeader = context.request.headers.get('Authorization');
  const url = new URL(context.request.url);
  const email = url.searchParams.get('email');
  
  if (!authHeader || !email) {
    return new Response(JSON.stringify({ error: 'Unauthorized or missing email' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Check if fan exists
    const response = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/fans?email=eq.${encodeURIComponent(email)}`,
      {
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      }
    );

    const fans = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch fan' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // If fan exists, return it
    if (fans.length > 0) {
      return new Response(JSON.stringify(fans[0]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fan doesn't exist, create it
    // Extract user ID from JWT token
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    const userId = payload.sub;

    const createResponse = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/fans`,
      {
        method: 'POST',
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          email: email,
          username: 'Admin User',
          auth_id: userId,
          status: 'active'
        })
      }
    );

    const newFan = await createResponse.json();
    
    if (!createResponse.ok) {
      return new Response(JSON.stringify({ error: 'Failed to create fan' }), {
        status: createResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(newFan[0]), {
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
