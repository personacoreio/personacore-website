// functions/api/admin/dashboard/costs.js
// Get system costs for current month

export async function onRequestGet(context) {
  const authHeader = context.request.headers.get('Authorization');
  
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Try RPC function first
    const rpcResponse = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/rpc/get_system_costs`,
      {
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Authorization': authHeader,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (rpcResponse.ok) {
      const data = await rpcResponse.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Fallback: calculate from daily_analytics
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    
    const analyticsResponse = await fetch(
      `${context.env.SUPABASE_URL}/rest/v1/daily_analytics?date=gte.${firstDay}&select=total_cost_usd`,
      {
        headers: {
          'apikey': context.env.SUPABASE_ANON_KEY,
          'Authorization': authHeader
        }
      }
    );
    
    const data = await analyticsResponse.json();
    const totalCost = data.reduce((sum, day) => sum + (day.total_cost_usd || 0), 0);
    
    return new Response(JSON.stringify(totalCost), {
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
