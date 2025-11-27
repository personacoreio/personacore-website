// functions/api/admin/conversation.js
// Create a new conversation

export async function onRequestPost(context) {
  const authHeader = context.request.headers.get('Authorization');
  
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { creator_id, fan_id } = await context.request.json();

    const response = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/conversations`,
      {
        method: 'POST',
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          creator_id,
          fan_id,
          status: 'active'
        })
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to create conversation' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data[0]), {
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
