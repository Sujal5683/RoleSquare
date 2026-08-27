import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const user = await getCurrentUser(true).catch(() => null);

    if (user) {
      const cookieStore = await cookies();
      cookieStore.delete("2fa_verified_" + user.id);
    }
    
    const supabase = await createClient();
    await supabase.auth.signOut();

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: true }); 
  }
}
