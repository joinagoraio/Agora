#!/usr/bin/env tsx

/**
 * Diagnostic script for workspace creation RLS issues
 * This script checks:
 * 1. If the user exists and has a profile
 * 2. If the user is a member of the space
 * 3. If the helper functions exist and work correctly
 * 4. If RLS policies are correctly configured
 */

import { createClient } from "@supabase/supabase-js"

async function diagnose() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Missing environment variables:")
    console.error("   NEXT_PUBLIC_SUPABASE_URL:", !!supabaseUrl)
    console.error("   SUPABASE_SERVICE_ROLE_KEY:", !!supabaseServiceKey)
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  console.log("🔍 Starting RLS Diagnostic...\n")

  // 1. Check helper functions exist
  console.log("1️⃣  Checking helper functions...")
  const { data: functions, error: funcError } = await supabase.rpc("pg_get_functiondef", {
    funcoid: "is_space_member",
  } as any)

  if (funcError) {
    console.log("   ⚠️  Could not verify helper functions directly")
  }

  // 2. Check RLS policies on workspaces table
  console.log("\n2️⃣  Checking RLS policies on workspaces table...")
  const { data: policies, error: policyError } = await supabase
    .from("pg_policies")
    .select("*")
    .eq("tablename", "workspaces")

  if (policyError) {
    console.error("   ❌ Error checking policies:", policyError.message)
  } else if (policies) {
    console.log(`   ✅ Found ${policies.length} policies on workspaces table`)
    policies.forEach((p: any) => {
      console.log(`      - ${p.policyname}`)
    })
  }

  // 3. Check spaces and their members
  console.log("\n3️⃣  Checking spaces and members...")
  const { data: spaces, error: spacesError } = await supabase
    .from("spaces")
    .select("id, name, owner_id")
    .limit(5)

  if (spacesError) {
    console.error("   ❌ Error fetching spaces:", spacesError.message)
  } else if (spaces && spaces.length > 0) {
    console.log(`   ✅ Found ${spaces.length} space(s)`)
    
    for (const space of spaces) {
      console.log(`\n   Space: ${space.name} (${space.id})`)
      console.log(`      Owner: ${space.owner_id}`)
      
      // Check space members
      const { data: members, error: membersError } = await supabase
        .from("space_members")
        .select("user_id, role")
        .eq("space_id", space.id)
      
      if (membersError) {
        console.error(`      ❌ Error fetching members:`, membersError.message)
      } else if (members) {
        console.log(`      Members: ${members.length}`)
        members.forEach((m: any) => {
          console.log(`         - User ${m.user_id}: ${m.role}`)
        })
      }
    }
  } else {
    console.log("   ⚠️  No spaces found")
  }

  // 4. Test helper function directly (if possible)
  console.log("\n4️⃣  Testing is_space_member function...")
  const { data: testSpaces } = await supabase
    .from("spaces")
    .select("id, owner_id")
    .limit(1)
    .single()

  if (testSpaces) {
    // Test two-parameter version
    try {
      const { data: testResult2, error: testError2 } = await supabase.rpc("is_space_member", {
        p_space_id: testSpaces.id,
        p_user_id: testSpaces.owner_id,
      } as any)

      if (testError2) {
        console.error("   ❌ Two-param version error:", testError2.message)
      } else {
        console.log(`   ✅ Two-param version works! Result: ${testResult2}`)
      }
    } catch (err: any) {
      console.error("   ❌ Two-param version exception:", err.message)
    }

    // Test one-parameter version (requires auth context, so may fail with service key)
    console.log("\n   Testing one-parameter version (may not work with service key)...")
    try {
      const { data: testResult1, error: testError1 } = await supabase.rpc("is_space_member", {
        p_space_id: testSpaces.id,
      } as any)

      if (testError1) {
        console.log("   ⚠️  One-param version error (expected with service key):", testError1.message)
      } else {
        console.log(`   ✅ One-param version works! Result: ${testResult1}`)
      }
    } catch (err: any) {
      console.log("   ⚠️  One-param version exception (expected):", err.message)
    }
  }

  // 5. Check workspace_notes and workspace_comments tables
  console.log("\n5️⃣  Checking workspace_notes and workspace_comments tables...")
  const { data: wsNotesPolicies, error: wsNotesError } = await supabase
    .from("pg_policies")
    .select("policyname")
    .eq("tablename", "workspace_notes")

  if (wsNotesError) {
    console.error("   ❌ Error checking workspace_notes policies:", wsNotesError.message)
  } else if (wsNotesPolicies && wsNotesPolicies.length > 0) {
    console.log(`   ✅ workspace_notes has ${wsNotesPolicies.length} policies`)
  } else {
    console.log("   ⚠️  No policies found for workspace_notes (may need RLS setup)")
  }

  const { data: wsCommentsPolicies, error: wsCommentsError } = await supabase
    .from("pg_policies")
    .select("policyname")
    .eq("tablename", "workspace_comments")

  if (wsCommentsError) {
    console.error("   ❌ Error checking workspace_comments policies:", wsCommentsError.message)
  } else if (wsCommentsPolicies && wsCommentsPolicies.length > 0) {
    console.log(`   ✅ workspace_comments has ${wsCommentsPolicies.length} policies`)
  } else {
    console.log("   ⚠️  No policies found for workspace_comments (may need RLS setup)")
  }

  console.log("\n" + "=".repeat(60))
  console.log("\n📋 DIAGNOSIS SUMMARY:")
  console.log("\nCommon RLS errors occur because:")
  console.log("1. ❌ Helper function is_space_member doesn't exist or has wrong signature")
  console.log("   - Need BOTH one-param and two-param versions")
  console.log("2. ❌ User is not in the space_members table for the space")
  console.log("3. ❌ RLS policies are checking space membership incorrectly")
  console.log("4. ❌ workspace_notes/workspace_comments policies missing or incorrect")
  console.log("\n🔧 TO FIX:")
  console.log("1. Run the fix_workspace_creation_rls.sql script in Supabase SQL Editor")
  console.log("   This fixes workspaces, workspace_notes, and workspace_comments")
  console.log("2. Verify users are added to space_members when spaces are created")
  console.log("3. Check that space creation is using adminClient properly")
  console.log("\n💡 COMMON ISSUES:")
  console.log("- Empty error objects {} usually mean RLS blocked the query")
  console.log("- Check Supabase logs for more detailed error messages")
  console.log("\n")
}

diagnose().catch(console.error)

