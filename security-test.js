#!/usr/bin/env node
/**
 * PersonaCore Security Test Suite
 * 
 * Run this script to perform automated security checks on your PersonaCore instance.
 * 
 * Usage:
 *   node security-test.js https://personacore.io
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.argv[2] || 'https://personacore.io';
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

console.log(`${colors.blue}
╔═══════════════════════════════════════════╗
║   PersonaCore Security Test Suite        ║
║   Testing: ${BASE_URL}   ║
╚═══════════════════════════════════════════╝
${colors.reset}`);

let passedTests = 0;
let failedTests = 0;
let warnings = 0;

function pass(message) {
  passedTests++;
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function fail(message) {
  failedTests++;
  console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function warn(message) {
  warnings++;
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

function info(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

// Utility function to make HTTP(S) requests
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

// Test Suite
async function runTests() {
  console.log(`\n${colors.magenta}=== HTTPS & SSL/TLS Tests ===${colors.reset}\n`);
  
  // Test 1: HTTPS redirect
  try {
    const httpUrl = BASE_URL.replace('https://', 'http://');
    const response = await request(httpUrl, { method: 'GET', followRedirect: false });
    if (response.status === 301 || response.status === 302 || response.status === 308) {
      const location = response.headers.location || '';
      if (location.startsWith('https://')) {
        pass('HTTP automatically redirects to HTTPS');
      } else {
        fail('HTTP redirect does not use HTTPS');
      }
    } else {
      warn('HTTP does not redirect (may be handled by Cloudflare)');
    }
  } catch (error) {
    info('HTTP test skipped (connection refused - likely Cloudflare enforcing HTTPS)');
  }
  
  // Test 2: Security headers
  try {
    const response = await request(BASE_URL);
    const headers = response.headers;
    
    const securityHeaders = {
      'strict-transport-security': 'HSTS (HTTP Strict Transport Security)',
      'x-content-type-options': 'X-Content-Type-Options: nosniff',
      'x-frame-options': 'X-Frame-Options (Clickjacking protection)',
      'content-security-policy': 'Content Security Policy',
    };
    
    for (const [header, description] of Object.entries(securityHeaders)) {
      if (headers[header]) {
        pass(`${description} header present`);
      } else {
        warn(`${description} header missing`);
      }
    }
  } catch (error) {
    fail(`Failed to check security headers: ${error.message}`);
  }
  
  console.log(`\n${colors.magenta}=== Authentication Tests ===${colors.reset}\n`);
  
  // Test 3: Protected routes
  try {
    const response = await request(`${BASE_URL}/chat`);
    // Should redirect to login or return 401/403
    if (response.status === 302 || response.status === 401 || response.status === 403) {
      pass('Chat page requires authentication');
    } else if (response.status === 200) {
      // Check if page has login check in JavaScript
      if (response.body.includes('checkAuth') || response.body.includes('login')) {
        pass('Chat page has authentication check');
      } else {
        fail('Chat page accessible without authentication');
      }
    }
  } catch (error) {
    fail(`Failed to test chat authentication: ${error.message}`);
  }
  
  console.log(`\n${colors.magenta}=== API Security Tests ===${colors.reset}\n`);
  
  // Test 4: SQL Injection in magic link endpoint
  try {
    const sqlInjection = { email: "test@test.com'; DROP TABLE users; --" };
    const response = await request(`${BASE_URL}/send-magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sqlInjection)
    });
    
    if (response.status === 400 || response.body.includes('Invalid email')) {
      pass('SQL injection attempt rejected');
    } else {
      fail('Potential SQL injection vulnerability');
    }
  } catch (error) {
    info('SQL injection test could not complete');
  }
  
  // Test 5: XSS in email field
  try {
    const xssPayload = { email: '<script>alert("xss")</script>@test.com' };
    const response = await request(`${BASE_URL}/send-magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(xssPayload)
    });
    
    if (response.status === 400 || response.body.includes('Invalid email')) {
      pass('XSS payload in email rejected');
    } else {
      warn('XSS payload may not be properly sanitized');
    }
  } catch (error) {
    info('XSS test could not complete');
  }
  
  // Test 6: Missing required fields
  try {
    const response = await request(`${BASE_URL}/send-magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    if (response.status === 400) {
      pass('Missing email field properly rejected');
    } else {
      fail('API accepts requests without required fields');
    }
  } catch (error) {
    info('Missing field test could not complete');
  }
  
  // Test 7: Invalid JSON
  try {
    const response = await request(`${BASE_URL}/send-magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid json {'
    });
    
    if (response.status === 400 || response.status === 500) {
      pass('Invalid JSON properly handled');
    } else {
      warn('Invalid JSON handling unclear');
    }
  } catch (error) {
    info('Invalid JSON test could not complete');
  }
  
  console.log(`\n${colors.magenta}=== Content Security Tests ===${colors.reset}\n`);
  
  // Test 8: Check for exposed secrets in HTML
  try {
    const response = await request(BASE_URL);
    const dangerousPatterns = [
      { pattern: /sk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe Live Secret Key' },
      { pattern: /sk_test_[a-zA-Z0-9]{24,}/, name: 'Stripe Test Secret Key' },
      { pattern: /whsec_[a-zA-Z0-9]{32,}/, name: 'Stripe Webhook Secret' },
      { pattern: /re_[a-zA-Z0-9]{32,}/, name: 'Resend API Key' },
      { pattern: /eyJ[a-zA-Z0-9_-]{100,}/, name: 'Potential JWT/Service Key' },
    ];
    
    let secretsFound = false;
    for (const { pattern, name } of dangerousPatterns) {
      if (pattern.test(response.body)) {
        fail(`CRITICAL: ${name} exposed in HTML!`);
        secretsFound = true;
      }
    }
    
    if (!secretsFound) {
      pass('No exposed secrets found in HTML');
    }
  } catch (error) {
    fail(`Failed to check for exposed secrets: ${error.message}`);
  }
  
  // Test 9: Check for Supabase anon key (should be present)
  try {
    const response = await request(BASE_URL);
    if (response.body.includes('eyJ') && response.body.includes('supabase')) {
      pass('Supabase anon key present (expected for client-side)');
    } else {
      info('Supabase anon key not found in HTML');
    }
  } catch (error) {
    info('Could not verify Supabase client configuration');
  }
  
  console.log(`\n${colors.magenta}=== Webhook Security Tests ===${colors.reset}\n`);
  
  // Test 10: Webhook without signature
  try {
    const response = await request(`${BASE_URL}/handle-stripe-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'invalid_signature'
      },
      body: JSON.stringify({ type: 'checkout.session.completed' })
    });
    
    if (response.status === 400 || response.status === 401) {
      pass('Webhook rejects invalid signatures');
    } else {
      fail('Webhook may not verify signatures properly');
    }
  } catch (error) {
    info('Webhook signature test could not complete');
  }
  
  // Test 11: Webhook without signature header
  try {
    const response = await request(`${BASE_URL}/handle-stripe-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.session.completed' })
    });
    
    if (response.status === 400 || response.status === 401) {
      pass('Webhook requires signature header');
    } else {
      warn('Webhook may accept requests without signature');
    }
  } catch (error) {
    info('Webhook header test could not complete');
  }
  
  // Print summary
  console.log(`\n${colors.blue}═══════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.green}Passed: ${passedTests}${colors.reset}`);
  console.log(`${colors.yellow}Warnings: ${warnings}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failedTests}${colors.reset}`);
  console.log(`${colors.blue}═══════════════════════════════════════════${colors.reset}\n`);
  
  const totalTests = passedTests + failedTests;
  const score = totalTests > 0 ? Math.round((passedTests / totalTests) * 10) : 0;
  
  console.log(`${colors.magenta}Security Score: ${score}/10${colors.reset}\n`);
  
  if (failedTests > 0) {
    console.log(`${colors.red}⚠️  CRITICAL: ${failedTests} security issue(s) found!${colors.reset}`);
    console.log('Please review the failed tests above and fix them immediately.\n');
    process.exit(1);
  } else if (warnings > 0) {
    console.log(`${colors.yellow}⚠️  ${warnings} warning(s) found.${colors.reset}`);
    console.log('Consider addressing these for improved security.\n');
  } else {
    console.log(`${colors.green}✓ All security tests passed!${colors.reset}\n`);
  }
}

// Run the tests
runTests().catch(error => {
  console.error(`${colors.red}Test suite error: ${error.message}${colors.reset}`);
  process.exit(1);
});
