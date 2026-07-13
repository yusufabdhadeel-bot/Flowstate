import { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../errors';

export interface TenantRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId?: string;
  };
  organizationId?: string;
}

export function requireTenantAccess(req: TenantRequest, res: Response, next: NextFunction) {
  try {
    if (!req.user?.organizationId) {
      throw new ForbiddenError('User organization context is missing');
    }

    req.organizationId = req.user.organizationId;
    next();
  } catch (error) {
    console.warn('[TENANT] User attempted unauthorized tenant access');
    if (error instanceof ForbiddenError) {
      return res.status(403).json({ error: error.message });
    }
    return res.status(403).json({ error: 'Forbidden' });
  }
}

export function assertSameTenant(resourceOrganizationId: string | null | undefined, userOrganizationId: string | null | undefined): void {
  if (!resourceOrganizationId || !userOrganizationId || resourceOrganizationId !== userOrganizationId) {
    console.warn('[TENANT] User attempted unauthorized tenant access');
    throw new ForbiddenError('Forbidden: organization mismatch');
  }
}
