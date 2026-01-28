
# Sproutly Quantum Setup Guide

## 1. Apply Database Schema
The file `supabase_schema.sql` contains the complete database definition with the Recursion Fix.

1. Go to your **Supabase Dashboard**.
2. Navigate to **SQL Editor**.
3. Create a **New Query**.
4. Copy and Paste the entire content of `supabase_schema.sql`.
5. Click **Run**.

## 2. Verify Connection
Ensure your `.env` file exists in the root directory with the correct credentials:

```
VITE_SUPABASE_URL=https://koibycgvdasjphceqmqo.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvaWJ5Y2d2ZGFzanBoY2VxbXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM2MDc0ODUsImV4cCI6MjA3OTE4MzQ4NX0.psZsaHVLrwIsRx4N7fO-cnWcls_eGCq8YdUa0gaGYF4
```

## 3. Verify Fix
Once the SQL is run:
1. Reload the application.
2. The "Save Failed" or "Permission Denied" errors should disappear.
3. The Admin dashboard will now correctly load team data without crashing.
