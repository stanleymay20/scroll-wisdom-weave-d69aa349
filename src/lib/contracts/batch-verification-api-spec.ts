/**
 * ============================================================================
 * BATCH VERIFICATION API SPECIFICATION (DESIGN ONLY)
 * ============================================================================
 * 
 * Status: DESIGN PHASE - NOT FOR PRODUCTION
 * Version: 0.1.0-draft
 * 
 * This document specifies the interface for institutional batch certificate
 * verification. Implementation should only proceed after:
 * 
 * 1. Single verification UX is validated by real employers
 * 2. Payload shape is confirmed through API usage analytics
 * 3. Rate limiting strategy is tested with real load
 * 
 * DO NOT IMPLEMENT until these conditions are met.
 * 
 * ============================================================================
 */

// ============================================================================
// ENDPOINT SPECIFICATION
// ============================================================================

/**
 * Batch Verification Endpoint
 * 
 * POST /api/v1/certificates/batch-verify
 * 
 * Headers:
 *   Authorization: Bearer <api_key>
 *   Content-Type: application/json
 * 
 * Rate Limits:
 *   - Free tier: 10 requests/hour, max 5 certificates per request
 *   - Institution tier: 100 requests/hour, max 50 certificates per request
 *   - Enterprise tier: 1000 requests/hour, max 500 certificates per request
 */

export interface BatchVerificationRequest {
  /** Array of certificate numbers to verify */
  certificates: string[];
  
  /** Optional: Include full metadata in response (slower) */
  includeMetadata?: boolean;
  
  /** Optional: Include book details (slower, requires DB join) */
  includeBookDetails?: boolean;
  
  /** Optional: Webhook URL for async results (for large batches) */
  webhookUrl?: string;
  
  /** Optional: Correlation ID for tracking */
  correlationId?: string;
}

export interface BatchVerificationResponse {
  /** Request metadata */
  meta: {
    requestId: string;
    timestamp: string;
    processedCount: number;
    validCount: number;
    invalidCount: number;
    processingTimeMs: number;
  };
  
  /** Verification results */
  results: CertificateVerificationResult[];
  
  /** Errors (for certificates that couldn't be processed) */
  errors?: BatchVerificationError[];
}

export interface CertificateVerificationResult {
  /** Certificate number (input) */
  certificateNumber: string;
  
  /** Verification status */
  status: 'valid' | 'invalid' | 'revoked' | 'not_found';
  
  /** Validity hierarchy result (Contract 12) */
  validity: {
    level: 'valid' | 'invalid' | 'revoked';
    checks: {
      notRevoked: boolean;
      hashValid: boolean;
      coverageMet: boolean;
      integrityPass: boolean;
    };
    failureReason?: string;
  };
  
  /** Quick summary for HR systems */
  summary: {
    holderName: string;
    bookTitle: string;
    certificateType: 'completion' | 'mastery';
    issuedAt: string;
    coveragePercentage: number;
    integrityClassification: 'trusted' | 'review' | 'flagged';
  };
  
  /** Full metadata (if requested) */
  metadata?: {
    bookId: string;
    bookType: string;
    bookCategory: string;
    bookContentHash: string;
    chaptersCompleted: number;
    totalChapters: number;
    assessmentSchema?: string;
    visualContract?: string;
    styleContract?: string;
    verificationHash: string;
  };
  
  /** Book details (if requested) */
  book?: {
    id: string;
    title: string;
    category: string;
    bookType: string;
    createdAt: string;
  };
}

export interface BatchVerificationError {
  certificateNumber: string;
  errorCode: 'NOT_FOUND' | 'INVALID_FORMAT' | 'PROCESSING_ERROR';
  message: string;
}

// ============================================================================
// ERROR RESPONSES
// ============================================================================

export interface APIErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
}

export const ERROR_CODES = {
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    status: 429,
    message: 'Rate limit exceeded. Please try again later.',
  },
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    status: 401,
    message: 'Invalid or missing API key.',
  },
  INVALID_REQUEST: {
    code: 'INVALID_REQUEST',
    status: 400,
    message: 'Request validation failed.',
  },
  BATCH_TOO_LARGE: {
    code: 'BATCH_TOO_LARGE',
    status: 400,
    message: 'Batch size exceeds maximum allowed for your tier.',
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    status: 500,
    message: 'An internal error occurred. Please try again.',
  },
} as const;

// ============================================================================
// RATE LIMITING TIERS
// ============================================================================

export interface RateLimitTier {
  name: string;
  requestsPerHour: number;
  maxBatchSize: number;
  includeMetadataAllowed: boolean;
  webhookSupported: boolean;
}

export const RATE_LIMIT_TIERS: Record<string, RateLimitTier> = {
  free: {
    name: 'Free',
    requestsPerHour: 10,
    maxBatchSize: 5,
    includeMetadataAllowed: false,
    webhookSupported: false,
  },
  institution: {
    name: 'Institution',
    requestsPerHour: 100,
    maxBatchSize: 50,
    includeMetadataAllowed: true,
    webhookSupported: true,
  },
  enterprise: {
    name: 'Enterprise',
    requestsPerHour: 1000,
    maxBatchSize: 500,
    includeMetadataAllowed: true,
    webhookSupported: true,
  },
};

// ============================================================================
// WEBHOOK PAYLOAD (for async large batches)
// ============================================================================

export interface WebhookPayload {
  event: 'batch_verification_complete';
  correlationId?: string;
  requestId: string;
  timestamp: string;
  data: BatchVerificationResponse;
}

// ============================================================================
// EXAMPLE USAGE
// ============================================================================

/**
 * Example: Verify 3 certificates
 * 
 * ```bash
 * curl -X POST https://api.scrolllibrary.app/v1/certificates/batch-verify \
 *   -H "Authorization: Bearer sk_inst_xxx" \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "certificates": [
 *       "CERT-2026-ABC123",
 *       "CERT-2026-DEF456", 
 *       "CERT-2026-GHI789"
 *     ],
 *     "includeMetadata": true
 *   }'
 * ```
 * 
 * Response:
 * ```json
 * {
 *   "meta": {
 *     "requestId": "req_abc123",
 *     "timestamp": "2026-01-21T10:30:00Z",
 *     "processedCount": 3,
 *     "validCount": 2,
 *     "invalidCount": 1,
 *     "processingTimeMs": 245
 *   },
 *   "results": [
 *     {
 *       "certificateNumber": "CERT-2026-ABC123",
 *       "status": "valid",
 *       "validity": {
 *         "level": "valid",
 *         "checks": {
 *           "notRevoked": true,
 *           "hashValid": true,
 *           "coverageMet": true,
 *           "integrityPass": true
 *         }
 *       },
 *       "summary": {
 *         "holderName": "Jane Doe",
 *         "bookTitle": "Introduction to Machine Learning",
 *         "certificateType": "mastery",
 *         "issuedAt": "2026-01-15T14:22:00Z",
 *         "coveragePercentage": 100,
 *         "integrityClassification": "trusted"
 *       }
 *     },
 *     // ... more results
 *   ]
 * }
 * ```
 */

// ============================================================================
// IMPLEMENTATION CHECKLIST (DO NOT IMPLEMENT YET)
// ============================================================================

export const IMPLEMENTATION_CHECKLIST = `
PRE-IMPLEMENTATION REQUIREMENTS:
□ Single verification page validated by 10+ real employers
□ API usage analytics shows demand for batch verification
□ Rate limiting strategy tested with synthetic load
□ Webhook infrastructure available (for enterprise tier)
□ API key management system in place
□ Documentation site ready

IMPLEMENTATION STEPS (when ready):
1. Create edge function: supabase/functions/batch-verify-certificates/index.ts
2. Add rate limiting middleware using rate_limit_log table
3. Implement API key validation (new table: api_keys)
4. Add webhook dispatch for async results
5. Create API documentation page
6. Add monitoring and alerting

TESTING REQUIREMENTS:
□ Load test with 100 concurrent batch requests
□ Validate rate limiting across all tiers
□ Test webhook delivery reliability
□ Verify Contract 12 compliance in batch context
□ Security audit for API key management
`;

// Types are already exported above via interface declarations
