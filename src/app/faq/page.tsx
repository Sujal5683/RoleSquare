import { PublicHeader } from "@/components/public/public-header";
import { PublicFooter } from "@/components/public/public-footer";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export const metadata = {
  title: "FAQ | RoleSquare",
};

export default function FAQPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicHeader />
      <main className="flex-1 py-16 md:py-24">
        <div className="mx-auto max-w-3xl px-4 md:px-6">
          <h1 className="text-4xl font-bold tracking-tight mb-4">Frequently Asked Questions</h1>
          <p className="text-lg text-muted-foreground mb-12">
            Everything you need to know about the product, billing, and technical architecture.
          </p>

          <div className="space-y-12">
            {FAQ_CATEGORIES.map((category, idx) => (
              <div key={idx}>
                <h2 className="text-2xl font-semibold mb-6">{category.title}</h2>
                <Accordion type="single" collapsible className="w-full">
                  {category.items.map((faq, i) => (
                    <AccordionItem key={i} value={`item-${idx}-${i}`}>
                      <AccordionTrigger className="text-left font-medium text-base">{faq.q}</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground leading-relaxed">
                        {faq.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>

        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

const FAQ_CATEGORIES = [
  {
    title: "General & Product",
    items: [
      {
        q: "What is the RoleSquare?",
        a: "It is a SaaS tool that connects directly to your Google Workspace (Gmail, Drive) and uses schema-driven AI to extract unstructured data (like invoices, contracts, or support tickets) into structured, queryable datasets."
      },
      {
        q: "Do I need technical skills to use the platform?",
        a: "No. Our visual rule builder lets you define exactly what fields you want to extract (e.g., 'Total Amount', 'Due Date'). The AI handles the complex parsing and validation under the hood."
      },
      {
        q: "What data sources are currently supported?",
        a: "We deeply integrate with Google Workspace, supporting Gmail (threads, attachments) and Google Drive (PDFs, Docs, Sheets, standard office documents)."
      }
    ]
  },
  {
    title: "Security & Privacy",
    items: [
      {
        q: "How secure is my data?",
        a: "We employ enterprise-grade security. OAuth tokens are encrypted at rest with strict key rotation. Your data is stored in isolated, row-level secured PostgreSQL tables on Supabase."
      },
      {
        q: "Will my data be used to train AI models?",
        a: "No. We strictly adhere to a zero-training policy. Your workspace data is sent to the LLM (like Gemini) purely for immediate inference and is never stored by the AI provider to train base models."
      },
      {
        q: "What permissions do you need for Google Workspace?",
        a: "We request read-only scopes for Gmail and Google Drive. We only scan and fetch data based on the specific filter rules you configure in the application."
      }
    ]
  },
  {
    title: "Technical Architecture",
    items: [
      {
        q: "How does the AI handle large documents?",
        a: "Our ingestion pipeline automatically chunks and parses large PDFs, HTML, and text documents while preserving structural context and page references, ensuring we don't hit LLM context window limits."
      },
      {
        q: "How do you verify AI hallucinations?",
        a: "Every extracted field includes an 'Evidence Record'. This points directly to the exact sentence and page in the source document where the AI found the information, allowing human reviewers to audit the results in seconds."
      },
      {
        q: "Can I export my datasets?",
        a: "Yes. Datasets can be exported instantly to CSV or synced directly back into a connected Google Sheet for reporting."
      }
    ]
  }
];
