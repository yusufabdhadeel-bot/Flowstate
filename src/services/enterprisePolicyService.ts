export interface DepartmentHierarchyInput {
  id: string;
  parentId?: string | null;
}

export function validateDepartmentHierarchy(departments: DepartmentHierarchyInput[]): boolean {
  const byId = new Map(departments.map((department) => [department.id, department]));
  const visited = new Set<string>();
  const stack = new Set<string>();

  const visit = (id: string): boolean => {
    if (stack.has(id)) {
      return false;
    }
    if (visited.has(id)) {
      return true;
    }

    stack.add(id);
    const parentId = byId.get(id)?.parentId;
    if (parentId && parentId !== id) {
      const parentExists = byId.has(parentId);
      if (!parentExists) {
        stack.delete(id);
        visited.add(id);
        return true;
      }

      const parentOk = visit(parentId);
      if (!parentOk) {
        stack.delete(id);
        return false;
      }
    }

    stack.delete(id);
    visited.add(id);
    return true;
  };

  return departments.every((department) => visit(department.id));
}

export function canRemovePermissionWithoutLockout(
  roleName: string,
  currentPermissions: string[],
  permissionsToRemove: string[],
): boolean {
  const criticalPermissions = ['manage_departments', 'manage_roles', 'manage_organization', 'manage_security'];
  const normalizedCurrent = new Set(currentPermissions);
  const normalizedRemoval = new Set(permissionsToRemove);

  if (roleName !== 'ADMIN') {
    return true;
  }

  const remaining = Array.from(normalizedCurrent).filter((permission) => !normalizedRemoval.has(permission));
  const wouldLoseCriticalPermission = criticalPermissions.some((permission) =>
    normalizedRemoval.has(permission) && !remaining.includes(permission),
  );

  return !wouldLoseCriticalPermission;
}
