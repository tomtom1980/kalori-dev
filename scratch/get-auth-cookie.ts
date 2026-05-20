import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !key || !secret) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const adminClient = createClient(url, secret, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const anonClient = createClient(url, key);

async function run() {
  // Find user by email
  const { data: listData, error: listError } = await adminClient.auth.admin.listUsers();
  if (listError) {
    console.error('listUsers failed:', listError.message);
    process.exit(1);
  }

  const email = 'dev-user@kalori.test';
  const password = 'KaloriDevSeed!2026';
  const existing = listData.users.find((u) => u.email === email);

  if (!existing) {
    console.log(`User ${email} does not exist, creating...`);
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createError || !createData.user) {
      console.error('createUser failed:', createError?.message || 'No user data');
      process.exit(1);
    }
    console.log('User created:', createData.user.id);
  } else {
    console.log(`User ${email} exists with ID ${existing.id}. Resetting password...`);
    const { data: updateData, error: updateError } = await adminClient.auth.admin.updateUserById(
      existing.id,
      { password },
    );
    if (updateError) {
      console.error('updateUserById failed:', updateError.message);
      process.exit(1);
    }
    console.log('Password reset complete.');
  }

  // Sign in using password
  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    console.error('Sign in failed:', signInError.message);
    process.exit(1);
  }

  const session = signInData.session;
  if (!session) {
    console.error('No session returned');
    process.exit(1);
  }

  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  };

  const cookieName = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const cookieValue = `base64-${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;

  console.log('COOKIE_NAME:', cookieName);
  console.log('COOKIE_VALUE:', cookieValue);
}

run();
