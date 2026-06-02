import { NextResponse } from 'next/server';

/**
 * Validates if the incoming Request is authorized with the correct ADMIN_SECRET_KEY.
 * Checks query parameter ?secret=..., Authorization: Bearer <secret>, and x-admin-secret header.
 */
export function verifyAdminSecret(req: Request): boolean {
  try {
    const { searchParams } = new URL(req.url);
    const querySecret = searchParams.get('secret');
    
    const authHeader = req.headers.get('authorization');
    const headerSecret = req.headers.get('x-admin-secret');
    
    const configSecret = process.env.ADMIN_SECRET_KEY || 'rcade-secret-super-key-alpha-2026';
    
    if (querySecret === configSecret) {
      return true;
    }
    
    if (headerSecret === configSecret) {
      return true;
    }
    
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      if (token === configSecret) {
        return true;
      }
    }
    
    return false;
  } catch (err) {
    console.error('[AdminAssert][Error] Exception during secret verification:', err);
    return false;
  }
}

/**
 * Returns a standardized, generic 401 Unauthorized response to mask internal key validation details.
 */
export function handleAdminUnauthorized() {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401 }
  );
}
