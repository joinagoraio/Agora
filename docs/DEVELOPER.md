# Agora Developer Guide

## Getting Started

This guide will help you set up the Agora development environment and start contributing.

---

## Prerequisites

- **Node.js** 20+ and npm/pnpm
- **Git** for version control
- **Supabase account** (free tier works)
- **OpenAI API key** (for AI features)
- **Code editor** (VS Code recommended)

---

## Initial Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/agora.git
cd agora
```

### 2. Install Dependencies

```bash
pnpm install
# or
npm install
```

### 3. Environment Variables

Create a `.env.local` file:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-...

# Optional: Redis (for caching/rate limiting)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Optional: App URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### 4. Database Setup

1. Create a Supabase project
2. Run migration scripts in order (see `scripts/` directory)
3. Verify tables are created

### 5. Run Development Server

```bash
pnpm dev
# or
npm run dev
```

Visit `http://localhost:3000`

---

## Project Structure

```
agora/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── auth/              # Auth pages
│   └── workspaces/        # Workspace pages
├── components/            # React components
│   ├── ui/               # Reusable UI components
│   └── ...               # Feature components
├── lib/                   # Shared code
│   ├── actions/          # Server actions
│   ├── cache/            # Caching
│   ├── middleware/       # Middleware
│   ├── rag/              # RAG search
│   ├── utils/            # Utilities
│   └── validations/      # Zod schemas
├── scripts/              # SQL migrations
├── tests/                # Tests
└── docs/                 # Documentation
```

---

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Follow TypeScript best practices
- Write tests for new features
- Update documentation as needed

### 3. Run Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test --watch

# Coverage
pnpm test --coverage
```

### 4. Lint Code

```bash
pnpm lint
```

### 5. Commit Changes

```bash
git add .
git commit -m "feat: add new feature"
```

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `test:` - Tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance

### 6. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Create a pull request on GitHub.

---

## Code Standards

### TypeScript

- Use TypeScript for all new code
- Avoid `any` types
- Use interfaces for object shapes
- Use enums for constants

### React Components

- Use functional components with hooks
- Keep components small and focused
- Use TypeScript for props
- Extract reusable logic to custom hooks

### API Routes

- Validate all inputs with Zod
- Use error handling utilities
- Return consistent response formats
- Add rate limiting where needed

### Server Actions

- Use "use server" directive
- Validate inputs
- Check permissions
- Handle errors gracefully

---

## Testing

### Unit Tests

Located in `tests/unit/` and `lib/**/*.test.ts`:

```typescript
import { describe, it, expect } from "vitest"

describe("MyFunction", () => {
  it("should do something", () => {
    expect(myFunction()).toBe(expected)
  })
})
```

### Integration Tests

Located in `tests/integration/`:

```typescript
import { describe, it, expect } from "vitest"
import { GET } from "@/app/api/endpoint/route"

describe("API Endpoint", () => {
  it("should return data", async () => {
    const response = await GET(request)
    expect(response.status).toBe(200)
  })
})
```

### E2E Tests

Located in `tests/e2e/`:

```typescript
import { test, expect } from "@playwright/test"

test("user can login", async ({ page }) => {
  await page.goto("/login")
  // ... test steps
})
```

---

## Database Migrations

### Creating a Migration

1. Create SQL file in `scripts/`:
   ```sql
   -- scripts/XXX_description.sql
   CREATE TABLE IF NOT EXISTS new_table (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL
   );
   ```

2. Make it idempotent (use `IF NOT EXISTS`)

3. Test locally first

4. Document in migration file

### Running Migrations

Run in Supabase SQL Editor in order.

---

## Common Tasks

### Adding a New API Route

1. Create file: `app/api/endpoint/route.ts`
2. Export handler functions (GET, POST, etc.)
3. Add validation with Zod
4. Add error handling
5. Add rate limiting if needed
6. Write tests

### Adding a New Component

1. Create file: `components/MyComponent.tsx`
2. Use TypeScript for props
3. Add to component exports if needed
4. Write tests if complex

### Adding a New Utility

1. Create file: `lib/utils/my-utility.ts`
2. Export functions
3. Add JSDoc comments
4. Write unit tests

---

## Debugging

### Local Development

- Use `console.log` (will be removed in production)
- Use browser DevTools
- Use React DevTools
- Check Vercel logs in dashboard

### API Debugging

- Check network tab in browser
- Use `curl` or Postman
- Check server logs
- Use error tracking (Sentry)

### Database Debugging

- Use Supabase SQL Editor
- Check RLS policies
- Verify indexes
- Check query performance

---

## Performance

### Optimization Tips

- Use React.memo for expensive components
- Use useMemo/useCallback appropriately
- Batch database queries
- Use caching where appropriate
- Monitor performance metrics

### Profiling

- Use React DevTools Profiler
- Use Chrome DevTools Performance
- Monitor API response times
- Check database query performance

---

## Security

### Best Practices

- Always validate inputs
- Use parameterized queries
- Check permissions before operations
- Sanitize HTML content
- Use HTTPS in production
- Keep dependencies updated

### Security Checklist

- [ ] Input validation (Zod)
- [ ] Authorization checks
- [ ] XSS protection (DOMPurify)
- [ ] CSRF protection
- [ ] Rate limiting
- [ ] Error handling (no sensitive data)

---

## Dependencies

### Adding Dependencies

```bash
pnpm add package-name
pnpm add -D package-name  # dev dependency
```

### Updating Dependencies

```bash
pnpm update
```

### Security Audits

```bash
pnpm audit
```

---

## Troubleshooting

### Common Issues

**Build fails:**
- Check Node.js version
- Clear `.next` folder
- Reinstall dependencies

**Database connection fails:**
- Verify environment variables
- Check Supabase project status
- Verify network access

**Tests fail:**
- Clear test cache: `pnpm test --clearCache`
- Check environment setup
- Verify mocks are correct

---

## Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [React Documentation](https://react.dev)
- [Vitest Documentation](https://vitest.dev)
- [Playwright Documentation](https://playwright.dev)

---

## Getting Help

- Check existing documentation
- Search GitHub issues
- Ask in team chat
- Create a new issue if needed

---

## Contributing

1. Read this guide
2. Set up development environment
3. Pick an issue or create one
4. Create feature branch
5. Make changes with tests
6. Submit pull request
7. Address review feedback

Thank you for contributing! 🎉

