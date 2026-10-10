import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [distArgument, apiUrlArgument] = process.argv.slice(2);
const distRoot = resolve(distArgument ?? 'frontend/dist');
const apiUrl = apiUrlArgument ?? process.env.VITE_API_URL ?? '';

if (!/^https:\/\/[^/]+\/api$/.test(apiUrl)) {
  throw new Error('VITE_API_URL must be an HTTPS origin ending in /api');
}

const configPath = resolve('frontend/public/staticwebapp.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const fallback = config.navigationFallback;
if (fallback?.rewrite !== '/index.html' || !Array.isArray(fallback.exclude)) {
  throw new Error('Static Web Apps must rewrite deep links to /index.html with exclusions');
}
for (const required of ['/api/*', '/assets/*']) {
  if (!fallback.exclude.includes(required)) {
    throw new Error(`Static Web Apps fallback is missing ${required}`);
  }
}

const forbiddenTokens = [
  'GEMINI_API_KEY',
  'RAWG_API_KEY',
  'POSTGRES_PASSWORD',
  'AZURE_CLIENT_SECRET',
  'AZURE_SUBSCRIPTION_ID',
  'AZURE_TENANT_ID',
];
const files = [];
function collect(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) collect(path);
    else files.push(path);
  }
}
collect(distRoot);
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const token of forbiddenTokens) {
    if (content.includes(token)) {
      throw new Error(`forbidden provider or infrastructure token found in ${file}`);
    }
  }
}

console.log(`verified SWA fallback, exclusions, HTTPS API URL, and ${files.length} bundle files`);
