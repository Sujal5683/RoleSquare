import { LandingView } from "@/components/views/landing-view";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  
  return <LandingView hasSession={!!session} />;
}
