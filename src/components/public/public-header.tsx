import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Zap, ArrowRight } from "lucide-react";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <Zap className="h-4 w-4" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold">Workspace</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Intelligence Platform</span>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link href="/#platform" className="text-muted-foreground hover:text-foreground transition-colors">Platform</Link>
          <Link href="/about" className="text-muted-foreground hover:text-foreground transition-colors">About Us</Link>
          <Link href="/faq" className="text-muted-foreground hover:text-foreground transition-colors">FAQ</Link>
          <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">Contact</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex text-muted-foreground hover:text-foreground">
            <Link href="/workspace">Sign in</Link>
          </Button>
          <Button size="sm" asChild className="shadow-sm">
            <Link href="/workspace">
              Get started
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
