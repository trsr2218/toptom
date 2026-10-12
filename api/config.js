// Public client configuration, read from the Vercel project's environment so nothing lives in git.
// SUPABASE_URL and SUPABASE_ANON_KEY are the project's URL and anon (public) key.
// GOOGLE_CLIENT_ID is optional: the public OAuth client ID for Google sign-in, when it differs from the built-in one.
// TOPIER_PAY_TO is the public address that receives wallet payments.
export default function handler(req, res) {
  res.setHeader('cache-control', 'public, max-age=300');
  res.setHeader('content-type', 'application/json');
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  const payTo = /^0x[0-9a-fA-F]{40}$/.test(process.env.TOPIER_PAY_TO || '') ? process.env.TOPIER_PAY_TO : '';
  const payments = !!(payTo && process.env.SUPABASE_SERVICE_ROLE_KEY);
  res.status(200).end(JSON.stringify({ supabaseUrl, supabaseAnonKey, googleClientId: process.env.GOOGLE_CLIENT_ID || '', topi: !!process.env.ANTHROPIC_API_KEY, payTo: payments ? payTo : '', chainId: 8453 }));
}
