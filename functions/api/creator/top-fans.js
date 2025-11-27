// functions/api/creator/top-fans.js
// Get top engaged fans for a creator

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const slug = url.searchParams.get('slug');
  
  if (!slug) {
    return new Response(JSON.stringify({ error: 'Missing slug parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const response = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/fan_engagement_detailed?creator_slug=eq.${slug}&order=engagement_score.desc&limit=10`,
      {
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch top fans' }), {
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
