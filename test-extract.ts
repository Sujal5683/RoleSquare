import { extractWithLLM } from "./src/lib/extraction";

async function main() {
  const result = await extractWithLLM({
    fields: [{ name: "location", type: "string" }],
    sourceText: "TechCorp is hiring Software Engineer Interns for Summer 2025.\nLocation: Bangalore",
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
