# Permission Denied Fix

## Error
```
permission denied for table workspace_members
```

## Cause
The `workspace_members` table needs explicit GRANT permissions for the `authenticated` and `anon` roles to work with the RLS policies.

## Fix Applied

I've updated the script to grant comprehensive permissions:

```sql
-- For workspace_members
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT SELECT ON public.workspace_members TO anon;

-- For related tables (needed by RLS policies)
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.space_members TO authenticated;
GRANT SELECT ON public.workspaces TO authenticated;
```

## Run the Script Again

**Copy the updated script:**
`scripts/fix_workspace_invitations_complete.sql`

The script now grants all necessary permissions before creating policies.

---

## Success Checklist

After running, verify:
1. ✅ No permission denied errors
2. ✅ All 4 workspace_invitations policies created
3. ✅ Public workspace viewing policy created
4. ✅ workspace_members viewing policy created
5. ✅ Verification passes

---

## If Still Getting Permission Errors

Run this separately first:

```sql
-- Grant comprehensive permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invitations TO authenticated;
GRANT SELECT ON public.workspace_invitations TO anon;
GRANT SELECT ON public.workspaces TO anon;
GRANT SELECT ON public.workspaces TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_members TO authenticated;
GRANT SELECT ON public.workspace_members TO anon;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.space_members TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
```

Then run the full script.

---

🎉 **Script is updated and ready to run!**

