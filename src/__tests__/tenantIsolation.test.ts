import assert from 'assert';
import { assertSameTenant } from '../middleware/tenant';
import { ForbiddenError } from '../errors';

function runTenantIsolationChecks(): void {
  assert.doesNotThrow(() => assertSameTenant('org-a', 'org-a'));
  assert.throws(() => assertSameTenant('org-a', 'org-b'), ForbiddenError);
}

runTenantIsolationChecks();
console.log('Tenant isolation checks passed');
