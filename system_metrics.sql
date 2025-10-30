-- PersonaCore: System-Wide Metrics Function
-- This function provides the system overview data for the admin dashboard

-- =====================================================
-- Function: get_system_costs()
-- Purpose: Calculate total system costs, revenue, and profit
-- =====================================================

CREATE OR REPLACE FUNCTION get_system_costs()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
  total_creators INTEGER;
  total_fans INTEGER;
  total_messages BIGINT;
  costs_this_month NUMERIC;
  revenue_this_month NUMERIC;
  profit_this_month NUMERIC;
BEGIN
  -- Count total creators
  SELECT COUNT(*) INTO total_creators FROM creators;
  
  -- Count total fans
  SELECT COUNT(*) INTO total_fans FROM fans;
  
  -- Count total messages
  SELECT COUNT(*) INTO total_messages FROM messages;
  
  -- Calculate costs this month (from daily_analytics)
  SELECT COALESCE(SUM(total_cost_usd) * 0.79, 0) INTO costs_this_month
  FROM daily_analytics
  WHERE date >= date_trunc('month', CURRENT_DATE);
  
  -- Calculate revenue this month (£5 per active fan)
  -- Assuming subscriptions table tracks active subscriptions
  SELECT COALESCE(COUNT(DISTINCT fan_id) * 5 * 0.79, 0) INTO revenue_this_month
  FROM subscriptions
  WHERE status = 'active'
    AND created_at >= date_trunc('month', CURRENT_DATE);
  
  -- Calculate profit
  profit_this_month := revenue_this_month - costs_this_month;
  
  -- Build result JSON
  result := json_build_object(
    'total_creators', total_creators,
    'total_fans', total_fans,
    'total_messages', total_messages,
    'total_cost_month_gbp', costs_this_month,
    'total_revenue_month_gbp', revenue_this_month,
    'total_profit_month_gbp', profit_this_month
  );
  
  RETURN result;
END;
$$;

-- =====================================================
-- Grant execute permission to anon role
-- =====================================================

GRANT EXECUTE ON FUNCTION get_system_costs() TO anon;
GRANT EXECUTE ON FUNCTION get_system_costs() TO authenticated;

-- =====================================================
-- Test the function
-- =====================================================

-- Run this to test:
-- SELECT get_system_costs();

-- Expected output:
-- {
--   "total_creators": 12,
--   "total_fans": 347,
--   "total_messages": 8492,
--   "total_cost_month_gbp": 245.32,
--   "total_revenue_month_gbp": 1735.00,
--   "total_profit_month_gbp": 1489.68
-- }

-- =====================================================
-- Alternative: If you prefer separate counts
-- =====================================================

-- If the above function is too slow, you can use direct count queries
-- The admin dashboard already has fallback code that does this:

-- Total Creators:
-- GET /rest/v1/creators?select=count
-- Header: Prefer: count=exact

-- Total Fans:
-- GET /rest/v1/fans?select=count
-- Header: Prefer: count=exact

-- Total Messages:
-- GET /rest/v1/messages?select=count
-- Header: Prefer: count=exact

-- Monthly Costs (from daily_analytics):
-- GET /rest/v1/daily_analytics?date=gte.2025-10-01&select=total_cost_usd

-- =====================================================
-- Notes
-- =====================================================

-- 1. The function assumes:
--    - You have a 'subscriptions' table with status='active'
--    - daily_analytics table tracks costs in USD
--    - Exchange rate is roughly 0.79 (USD to GBP)

-- 2. Update exchange rate as needed:
--    - Current: 0.79 (approximate)
--    - Or fetch live rates from an API

-- 3. Revenue calculation:
--    - Currently: COUNT(active_fans) * £5
--    - Adjust if you have different pricing tiers

-- 4. Performance:
--    - For 1000+ creators, consider caching this result
--    - Update cache every 5-10 minutes
--    - Store in Redis or a 'system_metrics' table

-- 5. Security:
--    - This function is SECURITY DEFINER
--    - It runs with creator privileges, not caller
--    - Only expose to admin users in production

-- =====================================================
-- Optional: Create a cached metrics table
-- =====================================================

CREATE TABLE IF NOT EXISTS system_metrics (
  id SERIAL PRIMARY KEY,
  total_creators INTEGER,
  total_fans INTEGER,
  total_messages BIGINT,
  monthly_cost_gbp NUMERIC,
  monthly_revenue_gbp NUMERIC,
  monthly_profit_gbp NUMERIC,
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create function to update cache
CREATE OR REPLACE FUNCTION update_system_metrics_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  metrics json;
BEGIN
  metrics := get_system_costs();
  
  INSERT INTO system_metrics (
    total_creators,
    total_fans,
    total_messages,
    monthly_cost_gbp,
    monthly_revenue_gbp,
    monthly_profit_gbp
  )
  VALUES (
    (metrics->>'total_creators')::INTEGER,
    (metrics->>'total_fans')::INTEGER,
    (metrics->>'total_messages')::BIGINT,
    (metrics->>'total_cost_month_gbp')::NUMERIC,
    (metrics->>'total_revenue_month_gbp')::NUMERIC,
    (metrics->>'total_profit_month_gbp')::NUMERIC
  );
  
  -- Keep only last 1000 records
  DELETE FROM system_metrics
  WHERE id NOT IN (
    SELECT id FROM system_metrics
    ORDER BY calculated_at DESC
    LIMIT 1000
  );
END;
$$;

-- Set up cron job (requires pg_cron extension)
-- Run every 5 minutes:
-- SELECT cron.schedule('update-metrics', '*/5 * * * *', 'SELECT update_system_metrics_cache()');

-- Query cached metrics:
-- SELECT * FROM system_metrics ORDER BY calculated_at DESC LIMIT 1;
