import { google } from "googleapis";

async function main() {
  google.options({ timeout: 1000 });
  console.log("Global options set.");
}

main().catch(console.error);
