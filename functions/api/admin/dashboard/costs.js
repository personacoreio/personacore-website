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
        method: 'POST',
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
    
    if (!analyticsResponse.ok) {
      // If daily_analytics doesn't exist or query fails, return zero
      return new Response(JSON.stringify({
        total_cost_month_gbp: 0,
        total_revenue_month_gbp: 0,
        total_profit_month_gbp: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const data = await analyticsResponse.json();
    
    // Handle empty data
    if (!Array.isArray(data) || data.length === 0) {
      return new Response(JSON.stringify({
        total_cost_month_gbp: 0,
        total_revenue_month_gbp: 0,
        total_profit_month_gbp: 0
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const totalCostUsd = data.reduce((sum, day) => sum + (day.total_cost_usd || 0), 0);
    const totalCostGbp = totalCostUsd * 0.79; // USD to GBP conversion
    
    return new Response(JSON.stringify({
      total_cost_month_gbp: totalCostGbp,
      total_revenue_month_gbp: 0, // Would need to calculate from subscriptions
      total_profit_month_gbp: -totalCostGbp
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Costs endpoint error:', error);
    // Return zero costs instead of 500 error
    return new Response(JSON.stringify({
      total_cost_month_gbp: 0,
      total_revenue_month_gbp: 0,
      total_profit_month_gbp: 0
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
