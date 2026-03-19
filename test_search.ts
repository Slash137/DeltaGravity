import dotenv from 'dotenv';
dotenv.config();

console.log("Key:", process.env.GOOGLE_CUSTOM_SEARCH_API_KEY ? "EXISTS" : "NO");
console.log("CX:", process.env.GOOGLE_CUSTOM_SEARCH_CX ? "EXISTS" : "NO");

import searchTool from './src/custom_tools/internet_search.js';
// the file is .ts, so we might need to use tsx to run it

async function main() {
  const result = await searchTool.handler({ query: "OpenAI o1 model release date" });
  console.log(result);
}
main();
