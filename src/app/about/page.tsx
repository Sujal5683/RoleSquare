import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";

export const metadata = {
  title: "About Us | RoleSquare",
};

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicHeader />
      <main className="flex-1 py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h1 className="text-4xl font-bold tracking-tight mb-8">About RoleSquare</h1>
          
          <div className="space-y-6 text-lg text-muted-foreground leading-relaxed">
            <p>
              We founded the RoleSquare to solve a problem that plagues almost every modern business: the massive accumulation of unstructured data hidden inside emails, PDFs, and internal documents.
            </p>
            
            <p>
              Every day, critical operational data—invoices, customer inquiries, bug reports, and vendor contracts—flows through Google Workspace. But because it is trapped in free-text emails and attachments, teams are forced to manually copy-paste this data into CRMs, ERPs, and databases. It's slow, error-prone, and incredibly inefficient.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-12 mb-4">Our Mission</h2>
            <p>
              Our mission is to instantly turn your unstructured communication streams into governed, queryable datasets.
            </p>
            <p>
              We believe that Artificial Intelligence shouldn't just be a conversational chatbot. It should be a deterministic extraction engine that operates reliably in the background. By directly hooking into Google Workspace APIs and applying strict, schema-driven AI extraction, we provide businesses with perfectly formatted data that is instantly ready for automation.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mt-12 mb-4">Evidence-First Engineering</h2>
            <p>
              We are obsessed with accuracy and trust. Black-box AI tools output data without explaining where it came from. We engineered our platform differently. Every single value extracted by our system comes with an Evidence Record—a strict traceability link pointing you to the exact document, page number, and paragraph where the AI found the information. 
            </p>
            <p>
              We bring the rigor of software engineering to the unpredictability of generative AI.
            </p>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
