// functions/api/admin/creators.js
// Get list of all creators (public endpoint)

export async function onRequestGet(context) {
  try {
    // Get creators from Supabase (uses anon key for public data)
    const response = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/creators?status=eq.active&select=id,name,slug&order=name`,
      {
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error('Supabase error:', data);
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch creators',
        details: data 
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Creators endpoint error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
