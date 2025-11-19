# Agora Security Documentation

## Overview

This document outlines the security measures, best practices, and audit checklist for the Agora application.

---

## Security Architecture

### Authentication & Authorization

- **Supabase Auth** - JWT-based authentication
- **RBAC** - Role-Based Access Control with 6 roles
- **RLS Policies** - Row-Level Security in Supabase
- **Session Management** - Secure server-side sessions
- **CSRF Protection** - Edge CSRF middleware

### Input Validation

- **Zod Schemas** - All API inputs validated
- **XSS Protection** - DOMPurify for HTML sanitization
- **SQL Injection Prevention** - Parameterized queries only
- **File Upload Validation** - Type and size restrictions

### Data Protection

- **Encryption at Rest** - Supabase database encryption
- **Encryption in Transit** - HTTPS/TLS enforced
- **Classification System** - Public, Internal, Confidential
- **Access Control** - Permission-based access

---

## Security Headers

All responses include security headers:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy: [configured]`

---

## Input Sanitization

### HTML Content

- All HTML content sanitized with DOMPurify
- Strict allowlist of tags and attributes
- No inline scripts or event handlers
- Server-side and client-side sanitization

### User Inputs

- File names sanitized
- Search queries sanitized
- URLs validated and sanitized
- Email addresses validated
- UUIDs validated

### File Uploads

- File type validation
- File size limits (50MB)
- MIME type checking
- Filename sanitization

---

## Database Security & RLS

- **Row-Level Security everywhere** – all customer-facing tables enforce RLS policies defined in `scripts/complete_migration.sql`
- **Policy evolution tracked** – historical fixes (`scripts/005_final_rls_fix.sql`, `scripts/006_final_recursion_fix.sql`, `scripts/027_optimize_query_indexes.sql`, `scripts/028_add_visibility_to_space_items.sql`, `scripts/029_update_space_items_visibility_defaults.sql`, `scripts/999_complete_rls_fix.sql`) are versioned for auditability
- **Workspace & space isolation** – policies restrict reads/writes to the caller’s memberships; privileged operations run through the service-role client only after explicit authorization checks in code
- **Consolidation plan** – the next schema release will snapshot all RLS definitions into a single verified migration and document the review in `docs/MIGRATIONS.md` so future audits can diff the entire policy surface quickly
- **Review cadence** – RLS coverage is re-validated whenever a new table ships and at least once per quarter; the review checklist lives in `docs/MIGRATIONS.md`

---

## Rate Limiting

All API endpoints have rate limits:

- **Chat API:** 10 requests/minute
- **Document Upload:** 5 requests/minute
- **Search API:** 20 requests/minute

Rate limits are per IP address using `x-forwarded-for` header.

---

## Dependency Security

### Vulnerability Scanning

- **Automated:** GitHub Actions workflow runs weekly
- **Manual:** `pnpm audit` for local checks
- **Snyk Integration:** Optional Snyk scanning

### Dependency Management

- All dependencies pinned to exact versions
- Regular security updates
- Audit before merging PRs

---

## Security Audit Checklist

### Authentication & Authorization

- [x] JWT-based authentication
- [x] Role-based access control
- [x] Row-level security policies
- [x] Session management
- [x] CSRF protection
- [x] Permission checks on all operations

### Input Validation

- [x] All API inputs validated with Zod
- [x] HTML content sanitized
- [x] File uploads validated
- [x] SQL injection prevention
- [x] XSS protection
- [x] Path traversal prevention

### Data Protection

- [x] Encryption at rest
- [x] Encryption in transit
- [x] Classification system
- [x] Access control
- [x] Secure storage

### Security Headers

- [x] Content-Type-Options
- [x] Frame-Options
- [x] XSS-Protection
- [x] Referrer-Policy
- [x] Permissions-Policy
- [x] Strict-Transport-Security
- [x] Content-Security-Policy

### Rate Limiting

- [x] Chat API rate limited
- [x] Upload API rate limited
- [x] Search API rate limited
- [x] IP-based rate limiting

### Error Handling

- [x] No sensitive data in error messages
- [x] Consistent error responses
- [x] Error logging (no sensitive data)
- [x] Error tracking integration

### Monitoring & Logging

- [x] Security event logging
- [x] Error tracking
- [x] Performance monitoring
- [x] Health checks

### Dependencies

- [x] Regular security audits
- [x] Pinned dependency versions
- [x] Automated vulnerability scanning
- [x] Update process documented

---

## Penetration Testing Preparation

### Test Areas

1. **Authentication**
   - Login/logout flows
   - Session management
   - Password reset
   - Multi-factor authentication (if implemented)

2. **Authorization**
   - Role-based access
   - Permission checks
   - Resource access control

3. **Input Validation**
   - XSS attempts
   - SQL injection attempts
   - File upload attacks
   - Path traversal attempts

4. **API Security**
   - Rate limiting bypass attempts
   - CSRF attacks
   - Authentication bypass
   - Authorization bypass

5. **Data Protection**
   - Data leakage
   - Encryption verification
   - Access control verification

### Test Environment

- Separate staging environment
- Test data (no production data)
- Monitoring enabled
- Logging enabled

---

## Security Best Practices

### For Developers

1. **Always validate inputs** - Use Zod schemas
2. **Sanitize HTML** - Use DOMPurify
3. **Check permissions** - Use authorization middleware
4. **Use parameterized queries** - Never concatenate SQL
5. **Keep dependencies updated** - Regular security audits
6. **Don't log sensitive data** - No passwords, tokens, etc.
7. **Use HTTPS** - Always in production
8. **Follow principle of least privilege** - Minimum required permissions

### For Deployment

1. **Environment variables** - Never commit secrets
2. **Database backups** - Regular automated backups
3. **Monitoring** - Set up alerts for security events
4. **Updates** - Keep all services updated
5. **Access control** - Limit access to production systems

---

## Incident Response

### Security Incident Procedure

1. **Identify** - Detect and confirm security incident
2. **Contain** - Isolate affected systems
3. **Eradicate** - Remove threat
4. **Recover** - Restore systems
5. **Learn** - Post-incident review

### Contact

- **Security Team:** security@agora.example.com
- **Emergency:** [emergency contact]
- **Bug Bounty:** [bug bounty program]

---

## Compliance

### GDPR

- Data encryption
- Access controls
- Data export capability
- Data deletion capability
- Privacy policy

### Security Standards

- OWASP Top 10 compliance
- Security headers implemented
- Input validation
- Secure authentication

---

## Regular Security Tasks

### Weekly

- Review security logs
- Check for dependency updates
- Review error tracking

### Monthly

- Security audit review
- Dependency vulnerability scan
- Access control review

### Quarterly

- Penetration testing
- Security policy review
- Incident response drill

---

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Next.js Security](https://nextjs.org/docs/going-to-production#security)
- [Supabase Security](https://supabase.com/docs/guides/platform/security)
- [Security Headers](https://securityheaders.com/)

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** create a public issue
2. Email security@agora.example.com
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours.

---

Last updated: 2024-01-01

