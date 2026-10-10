// Public client configuration, read from the Vercel project's environment so nothing lives in git.
// SUPABASE_URL and SUPABASE_ANON_KEY are the project's URL and anon (public) key.
export default function handler(req, res) {
  res.setHeader('cache-control', 'public, max-age=300');
  res.setHeader('content-type', 'application/json');
  const supabaseUrl = process.env.SUPABASE_URL || '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
  res.status(200).end(JSON.stringify({ supabaseUrl, supabaseAnonKey, topi: !!process.env.ANTHROPIC_API_KEY }));
}
