import test from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenError } from '../errors';
import { assertSameTenant, requireTenantAccess } from '../middleware/tenant';

test('assertSameTenant allows matching organization IDs', () => {
  assert.doesNotThrow(() => assertSameTenant('org-1', 'org-1'));
});

test('assertSameTenant rejects mismatched organization IDs', () => {
  assert.throws(
    () => assertSameTenant('org-1', 'org-2'),
    (error: unknown) => error instanceof ForbiddenError && error.message.includes('organization mismatch')
  );
});

test('requireTenantAccess blocks requests without organization context', () => {
  const req: any = { user: {} };
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  requireTenantAccess(req, res, next);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { error: 'User organization context is missing' });
  assert.equal(nextCalled, false);
});

test('requireTenantAccess allows requests with organization context', () => {
  const req: any = { user: { organizationId: 'org-1' } };
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  requireTenantAccess(req, res, next);

  assert.equal(nextCalled, true);
  assert.equal(req.organizationId, 'org-1');
});
