// functions/api/admin/creators.js
// Get list of all creators

export async function onRequestGet(context) {
  const authHeader = context.request.headers.get('Authorization');
  
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get creators from Supabase
    const response = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/creators?status=eq.active&order=name`,
      {
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch creators' }), {
        status: response.status,
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
