/**
 * SECURITY AUDIT LOGGING
 * 
 * Provides audit trail for security-sensitive operations.
 * Required for Ivy League institutional compliance.
 */

import { supabase } from '@/integrations/supabase/client';

export type AuditEventType = 
  | 'auth.login'
  | 'auth.logout'
  | 'auth.password_change'
  | 'auth.account_delete'
  | 'certificate.issued'
  | 'certificate.verified'
  | 'certificate.revoked'
  | 'book.published'
  | 'book.unpublished'
  | 'export.requested'
  | 'admin.role_change'
  | 'security.policy_violation';

export interface AuditLogEntry {
  eventType: AuditEventType;
  userId?: string;
  resourceType?: 'book' | 'chapter' | 'certificate' | 'profile' | 'user';
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Log a security audit event
 * This is fire-and-forget - failures are logged but don't block operations
 * 
 * Note: Uses raw fetch to avoid TypeScript issues with dynamically created tables
 */
export async function logSecurityEvent(entry: AuditLogEntry): Promise<void> {
  try {
    // Get current user if available
    const { data: { user } } = await supabase.auth.getUser();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      console.warn('[SecurityAudit] No session available for audit logging');
      return;
    }

    // Use direct REST call to avoid type issues with new tables
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/security_audit_log`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${session.access_token}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          event_type: entry.eventType,
          user_id: entry.userId || user?.id,
          resource_type: entry.resourceType,
          resource_id: entry.resourceId,
          metadata: entry.metadata || {},
        }),
      }
    );

    if (!response.ok) {
      console.warn('[SecurityAudit] Failed to log event:', response.statusText);
    }
  } catch (err) {
    console.warn('[SecurityAudit] Exception logging event:', err);
  }
}

/**
 * Log authentication events
 */
export const auditAuth = {
  login: (userId: string) => 
    logSecurityEvent({ eventType: 'auth.login', userId }),
  
  logout: (userId: string) => 
    logSecurityEvent({ eventType: 'auth.logout', userId }),
  
  passwordChange: (userId: string) => 
    logSecurityEvent({ eventType: 'auth.password_change', userId }),
  
  accountDelete: (userId: string) => 
    logSecurityEvent({ eventType: 'auth.account_delete', userId }),
};

/**
 * Log certificate events
 */
export const auditCertificate = {
  issued: (certificateId: string, userId: string, bookId: string) =>
    logSecurityEvent({
      eventType: 'certificate.issued',
      userId,
      resourceType: 'certificate',
      resourceId: certificateId,
      metadata: { bookId },
    }),
  
  verified: (certificateNumber: string, verifierId?: string) =>
    logSecurityEvent({
      eventType: 'certificate.verified',
      userId: verifierId,
      resourceType: 'certificate',
      metadata: { certificateNumber },
    }),
  
  revoked: (certificateId: string, reason: string) =>
    logSecurityEvent({
      eventType: 'certificate.revoked',
      resourceType: 'certificate',
      resourceId: certificateId,
      metadata: { reason },
    }),
};

/**
 * Log publishing events
 */
export const auditPublishing = {
  published: (bookId: string, userId: string) =>
    logSecurityEvent({
      eventType: 'book.published',
      userId,
      resourceType: 'book',
      resourceId: bookId,
    }),
  
  unpublished: (bookId: string, userId: string) =>
    logSecurityEvent({
      eventType: 'book.unpublished',
      userId,
      resourceType: 'book',
      resourceId: bookId,
    }),
};

/**
 * Log security violations
 */
export const auditViolation = (
  userId: string | undefined,
  violationType: string,
  details: Record<string, unknown>
) =>
  logSecurityEvent({
    eventType: 'security.policy_violation',
    userId,
    metadata: { violationType, ...details },
  });
