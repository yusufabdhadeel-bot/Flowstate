import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

process.env.JWT_SECRET = 'this_is_a_valid_jwt_secret_for_tests_123456';

import app from '../app';
import { authenticateToken } from '../middleware/auth';

let server: http.Server;
let baseUrl: string;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = 'http://127.0.0.1:' + address.port;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test('authentication rejects requests without a token', () => {
  const response = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  authenticateToken({ headers: {} } as any, response as any, () => {
    throw new Error('next must not be called');
  });

  assert.equal(response.statusCode, 401);
});

test('authentication rejects invalid tokens', () => {
  const response = {
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };

  authenticateToken({ headers: { authorization: 'Bearer invalid-token' } } as any, response as any, () => {
    throw new Error('next must not be called');
  });

  assert.equal(response.statusCode, 403);
});

test('authentication accepts a valid token and attaches claims', () => {
  const token = jwt.sign(
    { id: 'user-1', email: 'user@example.com', role: 'STAFF', organizationId: 'org-1' },
    process.env.JWT_SECRET!
  );
  const request: any = { headers: { authorization: 'Bearer ' + token } };
  let nextCalled = false;

  authenticateToken(request, {} as any, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(request.user.id, 'user-1');
  assert.equal(request.user.organizationId, 'org-1');
});

const protectedRoutes = [
  ['POST', '/memos', { title: 'Memo', content: 'Content', createdBy: 'attacker', organizationId: 'other-org' }],
  ['POST', '/memos/memo-1/comments', { userId: 'attacker', message: 'Comment' }],
  ['PUT', '/memos/memo-1/status', { status: 'APPROVED' }],
  ['POST', '/organizations/onboard', { name: 'Unauthorized organization' }],
 ] as const;

for (const route of protectedRoutes) {
  const method = route[0];
  const path = route[1];
  const body = route[2];

  test(method + ' ' + path + ' requires authentication', async () => {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    assert.equal(response.status, 401);
  });
}
