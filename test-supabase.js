import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hmcartafonsppirzmtoq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE'; // Replace with actual key

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function testCreateUser() {
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'test@example.com',
    email_confirm: true,
    user_metadata: {
      username: 'testuser'
    }
  });
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success! Created user:', data.user.id);
  }
}

testCreateUser();
