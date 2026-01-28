# Sproutly Quantum Setup Guide

## 🚨 Fix for "0 Leads / Broken CRM"
If your leads are missing or the CRM tab is crashing, your Database Security Policies are in a "Recursion Loop".

### Step 1: Run the SQL Repair (v5.5)
1. Go to your **Supabase Dashboard**.
2. Navigate to **SQL Editor** (left sidebar).
3. Create a **New Query**.
4. Copy the entire content of `supabase_schema.sql` (v5.5) from this project root.
5. Click **Run**.
6. Wait for the "Success" message.

### Step 2: MANDATORY Session Reset
1. Return to the Sproutly app.
2. **Sign Out** of the application.
3. **Sign In** again. This forces your browser to download a new security token that uses the updated non-recursive rules.
4. Hard Refresh: Press `Cmd + Shift + R` (Mac) or `Ctrl + F5` (Windows).

### Step 3: Verify Role
If you are a **Director** or **Manager**, go to the **Admin** tab. You should now see leads assigned to your unit members in the "Lead Assignment" section. If not, verify that their `organization_id` in the `profiles` table matches yours exactly.

## Deep Diagnostics
If issues persist, open the **Action Center** (Reminders Tab) and click the **Cloud Icon** (Sync Status). The Sync Inspector will show you exactly which table is being blocked.