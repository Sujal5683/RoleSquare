import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";

export const metadata = {
  title: "Contact Us | Workspace Intelligence Platform",
};

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicHeader />
      <main className="flex-1 py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h1 className="text-4xl font-bold tracking-tight mb-8">Contact Us</h1>
          
          <div className="space-y-6 text-lg text-muted-foreground leading-relaxed">
            <p>
              Have questions about our platform or need support? We're here to help. Reach out to our team using the contact information below, or drop us an email.
            </p>
            
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-6">
                <h3 className="font-semibold mb-2 text-foreground">Sales & Enterprise</h3>
                <p className="text-sm">sales@example.com</p>
              </div>
              <div className="rounded-lg border p-6">
                <h3 className="font-semibold mb-2 text-foreground">Technical Support</h3>
                <p className="text-sm">support@example.com</p>
              </div>
            </div>
            
            <p className="mt-8 text-sm pt-4 border-t">
              Our office hours are Monday through Friday, 9:00 AM to 5:00 PM (EST). We typically respond to all inquiries within 24 business hours.
            </p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
