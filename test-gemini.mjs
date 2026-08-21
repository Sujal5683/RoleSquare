import { callGeminiWithFallback } from "./src/lib/gemini.js";
import { config } from "dotenv";

config();

async function run() {
  try {
    const res = await callGeminiWithFallback([
      { role: "user", content: "Hello, testing the AI" }
    ]);
    console.log("Success:", res);
  } catch (err) {
    console.error("Error calling gemini:", err);
  }
}
run();
