import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";

export const metadata = {
  title: "Terms & Conditions | Workspace Intelligence Platform",
};

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicHeader />
      <main className="flex-1 py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Terms and Conditions</h1>
          <p className="text-sm text-muted-foreground mb-12">Last Updated: August 26, 2026</p>

          <div className="space-y-8 text-muted-foreground leading-relaxed">
            
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">1. Acceptance of Terms</h2>
              <p>
                By accessing or using the Workspace Intelligence Platform ("Service"), you agree to be bound by these Terms and Conditions ("Terms"). If you disagree with any part of the terms, you may not access the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">2. Description of Service</h2>
              <p>
                The Service is a cloud-based software that allows users to connect their Google Workspace accounts, configure extraction rules, and utilize Artificial Intelligence (AI) to extract structured datasets from unstructured documents (such as emails, PDFs, and spreadsheets).
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">3. User Responsibilities</h2>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li><strong>Authorization:</strong> You must have the legal right and necessary permissions to grant the Service access to the Google Workspace data you connect.</li>
                <li><strong>Account Security:</strong> You are responsible for safeguarding the password and authentication credentials that you use to access the Service.</li>
                <li><strong>Acceptable Use:</strong> You agree not to use the Service to extract, process, or store illegal content, malware, or highly sensitive regulated data (e.g., strict HIPAA compliance) unless a specific enterprise agreement is in place.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">4. AI-Generated Outputs & Accuracy</h2>
              <p>
                The Service utilizes large language models (LLMs) to extract and interpret data. While we strive for high accuracy and provide "Evidence Records" to trace extraction lineage, AI outputs are probabilistic by nature. 
              </p>
              <p className="mt-4 text-foreground font-medium">Disclaimer of Accuracy:</p>
              <p>
                We do not guarantee the 100% accuracy, completeness, or usefulness of any extracted dataset. You are responsible for verifying the accuracy of the data before using it in downstream business or automated processes. We shall not be held liable for any decisions made based on the extracted data.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">5. API Usage and Rate Limiting</h2>
              <p>
                Your use of the Service is subject to rate limits based on your subscription tier (e.g., token limits, concurrent extraction jobs). We reserve the right to throttle or suspend accounts that deliberately attempt to bypass these limits or place an unreasonable load on our infrastructure.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">6. Limitation of Liability</h2>
              <p>
                In no event shall the Workspace Intelligence Platform, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">7. Changes to Terms</h2>
              <p>
                We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will provide notice of any significant changes. By continuing to access or use our Service after those revisions become effective, you agree to be bound by the revised terms.
              </p>
            </section>

          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
