# Agora Architecture Documentation

## Overview

Agora is a Next.js-based application for document management, AI-powered search, and collaborative workspaces. It uses Supabase for backend services, OpenAI for AI capabilities, and Redis (Upstash) for caching and rate limiting.

---

## System Architecture

```
┌─────────────────┐
│   Next.js App   │
│  (Frontend +    │
│   API Routes)   │
└────────┬─────────┘
         │
         ├─────────────────┬──────────────────┬──────────────┐
         │                 │                  │              │
         ▼                 ▼                  ▼              ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Supabase   │  │   OpenAI    │  │   Upstash    │  │   Vercel    │
│  (Database, │  │   (AI API)   │  │   (Redis)    │  │  (Hosting)  │
│   Auth,     │  │              │  │              │  │             │
│   Storage)  │  │              │  │              │  │             │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

---

## Technology Stack

### Frontend
- **Next.js 16** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Radix UI** - Component library
- **React PDF** - PDF viewing
- **TipTap** - Rich text editing

### Backend
- **Next.js API Routes** - Server-side API endpoints
- **Supabase** - PostgreSQL database, authentication, storage
- **OpenAI API** - AI chat completions and query rewriting
- **Upstash Redis** - Caching and rate limiting

### Infrastructure
- **Vercel** - Hosting and deployment
- **GitHub Actions** - CI/CD
- **Playwright** - E2E testing
- **Vitest** - Unit and integration testing

---

## Application Structure

```
agora/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   │   ├── chat/          # Chat API
│   │   ├── documents/     # Document management
│   │   ├── search/        # Search API
│   │   └── health/        # Health checks
│   ├── auth/              # Authentication pages
│   ├── workspaces/        # Workspace pages
│   └── spaces/            # Space pages
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   └── ...               # Feature components
├── lib/                   # Shared libraries
│   ├── actions/          # Server actions
│   ├── cache/            # Caching utilities
│   ├── middleware/       # Middleware (auth, etc.)
│   ├── rag/              # RAG search logic
│   ├── rate-limit.ts     # Rate limiting
│   ├── utils/            # Utility functions
│   └── validations/      # Zod schemas
├── scripts/              # Database migration scripts
├── tests/                # Test files
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   ├── e2e/             # E2E tests
│   └── performance/     # Performance tests
└── docs/                 # Documentation
```

---

## Data Flow

### Document Upload Flow

```
1. User uploads document
   ↓
2. API validates input (Zod schema)
   ↓
3. Check rate limit
   ↓
4. Check authorization (RBAC)
   ↓
5. Upload to Supabase Storage
   ↓
6. Extract text and metadata
   ↓
7. Store in database (documents table)
   ↓
8. Process pages (document_pages table)
   ↓
9. Invalidate cache
   ↓
10. Return success response
```

### Chat Flow

```
1. User sends message
   ↓
2. API validates input
   ↓
3. Check rate limit
   ↓
4. Get conversation history
   ↓
5. Build workspace context (RAG)
   ↓
6. Search relevant documents
   ↓
7. Generate AI response (OpenAI)
   ↓
8. Stream response to client
   ↓
9. Save message to database
```

### Search Flow

```
1. User submits search query
   ↓
2. API validates input
   ↓
3. Check rate limit
   ↓
4. Check cache (Redis)
   ↓
5. Query database with filters
   ↓
6. Apply pagination
   ↓
7. Cache results (Redis)
   ↓
8. Return paginated results
```

---

## Database Schema

### Core Tables

- **spaces** - Organizations/tenants
- **workspaces** - Project workspaces
- **documents** - Document metadata
- **document_pages** - Page-level document content
- **conversations** - Chat conversations
- **messages** - Chat messages
- **workspace_items** - Items in workspaces (with inheritance)
- **space_items** - Items in spaces (publishable artifacts)
- **space_members** - User memberships in spaces
- **sources** - External data sources

### Key Relationships

- Workspace → Space (many-to-one)
- Workspace → Documents (one-to-many)
- Document → Document Pages (one-to-many)
- Workspace → Conversations (one-to-many)
- Conversation → Messages (one-to-many)
- Space → Space Members (one-to-many)

---

## Security Architecture

### Authentication
- **Supabase Auth** - JWT-based authentication
- **Session management** - Server-side session cookies
- **CSRF protection** - Edge CSRF middleware

### Authorization
- **RBAC (Role-Based Access Control)** - Roles: TENANT_ADMIN, ORG_MANAGER, PROJECT_OWNER, ANALYST, CONTRIBUTOR, VIEWER, EXTERNAL
- **Permission checks** - Middleware-based permission validation
- **Row-Level Security (RLS)** - Supabase RLS policies

### Input Validation
- **Zod schemas** - All API inputs validated
- **XSS protection** - DOMPurify for HTML sanitization
- **Rate limiting** - Per-IP rate limits on all endpoints

### Data Protection
- **Encryption at rest** - Supabase handles database encryption
- **Encryption in transit** - HTTPS/TLS for all connections
- **Classification system** - Public, Internal, Confidential

---

## Caching Strategy

### Cache Layers

1. **Redis Cache (Upstash)**
   - API response caching (5-minute TTL)
   - Workspace metadata caching
   - Search result caching

2. **Next.js Cache**
   - Request deduplication
   - Static page caching
   - ISR (Incremental Static Regeneration)

### Cache Invalidation

- Tag-based invalidation
- Automatic invalidation on data mutations
- Manual invalidation via API

---

## Performance Optimizations

### Database
- **Indexes** - Comprehensive indexes on frequently queried columns
- **Batch queries** - Reduced N+1 query problems
- **Connection pooling** - Supabase connection pooling

### API
- **Request deduplication** - Prevents duplicate concurrent requests
- **Response caching** - Redis-backed caching
- **Pagination** - Efficient handling of large result sets

### RAG Search
- **Batch page fetching** - Single query for all pages
- **Parallel data fetching** - Notes and evidence fetched in parallel
- **Query rewriting caching** - Cached AI query rewrites

---

## Monitoring & Observability

### Health Checks
- `/api/health` - Comprehensive health check
- `/api/health/live` - Liveness probe
- `/api/health/ready` - Readiness probe

### Metrics
- `/api/metrics` - Application metrics (JSON/Prometheus)
- In-memory metrics collection
- Ready for external metrics services

### Logging
- Structured logging (JSON format)
- Environment-aware logging levels
- Error tracking integration (Sentry-ready)

### Performance Monitoring
- Operation duration tracking
- Configurable performance thresholds
- Automatic slow query detection

---

## Deployment Architecture

### Production Environment
- **Vercel** - Hosting platform
- **Supabase** - Managed PostgreSQL and Auth
- **Upstash** - Managed Redis
- **OpenAI** - External AI service

### CI/CD Pipeline
- **GitHub Actions** - Automated testing
- **Vitest** - Unit and integration tests
- **Playwright** - E2E tests
- **Automated deployments** - Vercel integration

---

## Scalability Considerations

### Horizontal Scaling
- Stateless API routes (can scale horizontally)
- Redis for shared state
- Database connection pooling

### Vertical Scaling
- Next.js serverless functions auto-scale
- Supabase auto-scales database connections
- Upstash Redis scales automatically

### Performance Limits
- Rate limiting prevents abuse
- Pagination prevents large result sets
- Caching reduces database load

---

## Future Enhancements

### Planned Features
- Webhook support for events
- Real-time collaboration (WebSockets)
- Advanced analytics dashboard
- Multi-region deployment
- GraphQL API option

### Technical Debt
- Migrate to Next.js 15+ features
- Implement full Sentry integration
- Add comprehensive API versioning
- Expand E2E test coverage

---

## Development Guidelines

### Code Organization
- Feature-based structure
- Shared utilities in `lib/`
- Type-safe implementations
- Comprehensive error handling

### Testing
- Unit tests for utilities
- Integration tests for API routes
- E2E tests for critical flows
- Performance tests for bottlenecks

### Documentation
- Inline code documentation
- API documentation
- Architecture documentation
- Deployment guides

---

## Support & Maintenance

### Monitoring
- Health check endpoints
- Metrics collection
- Error tracking
- Performance monitoring

### Maintenance
- Regular dependency updates
- Security patches
- Performance optimizations
- Database migrations

---

For more details, see:
- [API Documentation](./API.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Developer Guide](./DEVELOPER.md)

