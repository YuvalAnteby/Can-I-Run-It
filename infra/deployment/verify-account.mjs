import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

try {
  const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  if (process.argv[3] === 'sku') {
    // SKU discovery supplements the human-verified PostgreSQL16/quota/free-grant evidence.
    const names = [];
    function visit(value) {
      if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
        if (key === 'name' && typeof item === 'string') names.push(item);
        visit(item);
      }
    }
    visit(response);
    assert(names.includes('Standard_B1ms') || names.includes('B_Standard_B1ms'));
    console.log('B1ms is present in the selected region; account/version/quota/free-grant proof remains required.');
  } else {
    assert.equal(response.subscription, process.env.AZURE_SUBSCRIPTION_ID);
    assert.equal(response.tenant, process.env.AZURE_TENANT_ID);
    assert.equal(response.state, 'Enabled');
    console.log('Authenticated account matches the reviewed deployment evidence.');
  }
} catch {
  console.error('Account/region verification failed; refusing deployment.');
  process.exitCode = 1;
}
