// functions/api/admin/dashboard/metrics.js
// Get system-wide metrics (creator count, fan count, message count)

export async function onRequestGet(context) {
  const authHeader = context.request.headers.get('Authorization');
  
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get creator count
    const creatorsResponse = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/creators?select=count`,
      {
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Prefer': 'count=exact'
        }
      }
    );
    const creatorCount = parseInt(creatorsResponse.headers.get('content-range')?.split('/')[1]) || 0;

    // Get fan count
    const fansResponse = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/fans?select=count`,
      {
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Prefer': 'count=exact'
        }
      }
    );
    const fanCount = parseInt(fansResponse.headers.get('content-range')?.split('/')[1]) || 0;

    // Get message count
    const messagesResponse = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/messages?select=count`,
      {
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Prefer': 'count=exact'
        }
      }
    );
    const messageCount = parseInt(messagesResponse.headers.get('content-range')?.split('/')[1]) || 0;

    return new Response(JSON.stringify({
      creators: creatorCount,
      fans: fanCount,
      messages: messageCount
    }), {
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
