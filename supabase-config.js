/* DASTIN Supabase configuration.
   The anon key is a PUBLIC key by design — it only allows reading data that
   Row Level Security permits. Writes require the admin login. Never put the
   service_role / secret key in this file. */
window.DASTIN_SUPABASE_CONFIG = {
  url: 'https://gjucrqiizhoevlcfshxp.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdqdWNycWlpemhvZXZsY2ZzaHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODEwMTUsImV4cCI6MjEwNjI1NzAxNX0.2N7zZ2p0PdRZVe9_mGolWTOS0Mef4TnEMKNVjsQ01zI'
};
