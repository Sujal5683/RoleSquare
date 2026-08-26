import Link from "next/link";
import { Zap } from "lucide-react";

export function PublicFooter() {
  return (
    <footer className="border-t bg-background pt-16 pb-8">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="grid gap-10 md:grid-cols-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
                <Zap className="h-5 w-5" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-base font-semibold">Workspace</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Intelligence Platform</span>
              </div>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">
              Automating data extraction from Google Workspace into structured, queryable datasets using deterministic AI.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-4 text-foreground">Product</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/#platform" className="hover:text-primary transition-colors">Platform Overview</Link></li>
              <li><Link href="/#security" className="hover:text-primary transition-colors">Security</Link></li>
              <li><Link href="/#pricing" className="hover:text-primary transition-colors">Pricing</Link></li>
              <li><Link href="/faq" className="hover:text-primary transition-colors">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-4 text-foreground">Company</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/about" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact</Link></li>
              <li><a href="https://twitter.com" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">Twitter</a></li>
              <li><a href="https://github.com" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">GitHub</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-4 text-foreground">Legal</h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms" className="hover:text-primary transition-colors">Terms & Conditions</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-16 pt-8 border-t flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Workspace Intelligence Platform. All rights reserved.
          </p>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Powered by Gemini</span>
            <span>Secured by Supabase</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
