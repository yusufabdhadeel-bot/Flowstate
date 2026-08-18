import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDepartmentHierarchy, canRemovePermissionWithoutLockout } from '../services/enterprisePolicyService';

test('detects circular department hierarchy', () => {
  const departments = [
    { id: 'dept-1', parentId: 'dept-2' },
    { id: 'dept-2', parentId: 'dept-1' },
  ];

  assert.equal(validateDepartmentHierarchy(departments as any), false);
});

test('allows permission removal when it would not lock out an admin role', () => {
  const permissions = ['manage_departments', 'manage_roles', 'view_dashboard'];
  const removal = ['view_dashboard'];

  assert.equal(canRemovePermissionWithoutLockout('ADMIN', permissions, removal), true);
});

test('blocks permission removal that would lock out an admin role', () => {
  const permissions = ['manage_departments', 'manage_roles'];
  const removal = ['manage_departments', 'manage_roles'];

  assert.equal(canRemovePermissionWithoutLockout('ADMIN', permissions, removal), false);
});
