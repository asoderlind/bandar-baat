# Architecture Overview

This document describes the architecture and patterns used in this full-stack application. The patterns are domain-agnostic and can be adapted for various use cases such as habit trackers, budgeting apps, language learning platforms, or any data-driven personal productivity application.

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Monorepo Structure](#monorepo-structure)
- [Frontend Architecture](#frontend-architecture)
- [Backend Architecture](#backend-architecture)
- [Database Design](#database-design)
- [Shared Packages](#shared-packages)
- [Authentication & Authorization](#authentication--authorization)
- [State Management](#state-management)
- [Development Workflow](#development-workflow)
- [Adapting for Other Domains](#adapting-for-other-domains)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Client Layer                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    React + Vite SPA                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │   Views     │  │ Components  │  │   React Query       │  │   │
│  │  │  (Pages)    │  │    (UI)     │  │  (Server State)     │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ HTTP/REST
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           API Layer                                 │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     Hono Framework                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │   Routes    │  │ Middleware  │  │   Validation        │  │   │
│  │  │ (Endpoints) │  │ (Auth/CORS) │  │     (Zod)           │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Drizzle ORM
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Data Layer                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                      PostgreSQL                              │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │    Auth     │  │   Domain    │  │    Analytics        │  │   │
│  │  │   Tables    │  │   Tables    │  │     Views           │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Core Principles:**

1. **Type Safety End-to-End** - TypeScript across all layers with shared types
2. **User Isolation** - Multi-user architecture with data segregation by `userId`
3. **Offline-First Considerations** - Local draft persistence for incomplete work
4. **Modular Design** - Clear separation between UI, business logic, and data access

---

## Monorepo Structure

The project uses **pnpm workspaces** to manage multiple packages in a single repository.

```
project-root/
├── apps/
│   ├── api/                    # Backend API server
│   │   ├── src/
│   │   │   ├── index.ts        # Server entry point
│   │   │   ├── auth.ts         # Authentication setup
│   │   │   ├── db/
│   │   │   │   ├── index.ts    # Database connection
│   │   │   │   ├── schema.ts   # Drizzle schema definitions
│   │   │   │   └── migrate.ts  # Migration runner
│   │   │   └── routes/         # API route handlers
│   │   ├── drizzle/            # Migration files
│   │   └── drizzle.config.ts   # Drizzle configuration
│   │
│   └── web/                    # Frontend application
│       ├── src/
│       │   ├── main.tsx        # App entry point
│       │   ├── App.tsx         # Root component
│       │   ├── components/
│       │   │   ├── ui/         # Reusable UI primitives
│       │   │   ├── views/      # Page-level components
│       │   │   └── [domain]/   # Domain-specific components
│       │   ├── hooks/          # Custom React hooks
│       │   └── lib/            # Utilities and API client
│       └── vite.config.ts      # Build configuration
│
├── packages/
│   └── shared/                 # Shared types and utilities
│       └── src/
│           └── index.ts        # Exported types and helpers
│
├── pnpm-workspace.yaml         # Workspace configuration
├── docker-compose.dev.yml      # Development containers
└── docker-compose.prod.yml     # Production containers
```

**Benefits:**

- **Code Sharing** - Types and utilities shared between frontend and backend
- **Atomic Changes** - Related changes across packages in single commits
- **Consistent Tooling** - Unified linting, testing, and build processes
- **Independent Deployments** - Packages can be built and deployed separately

---

## Frontend Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | React 19 | UI rendering |
| Build Tool | Vite | Fast development and bundling |
| Styling | Tailwind CSS | Utility-first styling |
| Components | shadcn/ui + Radix | Accessible UI primitives |
| Data Fetching | TanStack React Query | Server state management |
| Authentication | better-auth | Session-based auth |
| Charts | Recharts | Data visualization |

### Component Organization

```
src/components/
├── ui/                         # Generic, reusable components
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   └── ...
│
├── views/                      # Page-level components (one per "screen")
│   ├── DashboardView.tsx       # Main entry point
│   ├── EntryView.tsx           # Data entry interface
│   ├── HistoryView.tsx         # Historical data review
│   ├── AnalyticsView.tsx       # Charts and insights
│   └── SettingsView.tsx        # User preferences
│
└── [domain]/                   # Domain-specific components
    ├── EntryCard.tsx           # Single entry display
    ├── EntryForm.tsx           # Entry creation form
    ├── types.ts                # Domain types
    └── useEntryDraft.ts        # Local draft management
```

### Path Aliases

TypeScript path aliases simplify imports:

```typescript
// Instead of: import { Button } from "../../../components/ui/button"
import { Button } from "@/components/ui/button"
```

Configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## Backend Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Hono | Lightweight HTTP framework |
| Database | PostgreSQL | Relational data storage |
| ORM | Drizzle | Type-safe database queries |
| Validation | Zod | Request/response validation |
| Authentication | better-auth | Session management |

### Route Organization

```
src/routes/
├── entries.ts          # CRUD for primary domain entities
├── categories.ts       # CRUD for categorization/grouping
├── analytics.ts        # Aggregation and reporting endpoints
└── import-export.ts    # Bulk data operations
```

### Middleware Stack

```typescript
// Applied in order:
app.use("*", logger())           // Request logging
app.use("*", cors({              // Cross-origin requests
  origin: process.env.FRONTEND_URL,
  credentials: true
}))
app.use("/api/*", requireAuth)   // Authentication check
```

### API Response Pattern

All endpoints return a consistent response structure:

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// Success response
{ success: true, data: { id: 1, name: "..." } }

// Error response
{ success: false, error: "Validation failed" }
```

---

## Database Design

### Schema Patterns

**1. User Isolation**

Every user-owned table includes a `userId` foreign key:

```typescript
export const entries = pgTable("entries", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  // ... domain fields
})
```

**2. Soft Deletes for Master Data**

Reference data uses soft deletes to preserve historical accuracy:

```typescript
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  deletedAt: timestamp("deleted_at"),  // Soft delete marker
})
```

**3. Hierarchical Data**

Parent-child relationships with cascading deletes:

```typescript
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
})

export const entries = pgTable("entries", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .references(() => sessions.id, { onDelete: "cascade" }),
})
```

**4. Uniqueness Constraints**

Prevent duplicate entries:

```typescript
export const sessions = pgTable("sessions", {
  // ... fields
}, (table) => ({
  uniqueUserDate: unique().on(table.userId, table.date),
}))
```

### Migration Workflow

```bash
# Generate migration from schema changes
pnpm db:generate

# Apply migrations to database
pnpm db:migrate

# Push schema directly (development only)
pnpm db:push

# Open visual database browser
pnpm db:studio
```

---

## Shared Packages

The `packages/shared` package provides type safety across the stack.

### What to Share

```typescript
// Types - Domain models
export interface Entry {
  id: number
  date: string
  category: string
  value: number
}

// Enums - Consistent across frontend/backend
export type Category = "work" | "health" | "learning" | "social"

// Constants - Avoid magic strings
export const CATEGORIES = ["work", "health", "learning", "social"] as const

// Utilities - Date formatting, calculations
export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]
}
```

### Package Configuration

```json
{
  "name": "@project/shared",
  "main": "./src/index.ts",
  "types": "./src/index.ts"
}
```

Referenced in other packages:

```json
{
  "dependencies": {
    "@project/shared": "workspace:*"
  }
}
```

---

## Authentication & Authorization

### Flow

```
┌─────────┐       ┌─────────┐       ┌─────────┐
│ Client  │──────▶│   API   │──────▶│   DB    │
│         │       │         │       │         │
│ Cookie  │◀──────│ Session │◀──────│ Session │
│ (token) │       │ Check   │       │ Table   │
└─────────┘       └─────────┘       └─────────┘
```

### Implementation

**Backend Setup:**

```typescript
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 7,  // 7 days
    updateAge: 60 * 60 * 24,      // Update daily
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
})
```

**Frontend Setup:**

```typescript
import { createAuthClient } from "better-auth/react"

export const { useSession, signIn, signOut } = createAuthClient({
  baseURL: "/api/auth",
})
```

**Protected Routes:**

```typescript
const requireAuth = async (c: Context, next: Next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user) {
    return c.json({ success: false, error: "Unauthorized" }, 401)
  }
  c.set("user", session.user)
  return next()
}
```

---

## State Management

### Three-Layer Approach

```
┌─────────────────────────────────────────────────────────┐
│                    Server State                         │
│         (React Query - synced with backend)             │
│  ┌─────────────────────────────────────────────────┐   │
│  │  useQuery(["entries"])                           │   │
│  │  useMutation + invalidateQueries                 │   │
│  └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                    Client State                         │
│           (React hooks - UI interactions)               │
│  ┌─────────────────────────────────────────────────┐   │
│  │  useState for modals, selections, filters        │   │
│  │  useReducer for complex form state               │   │
│  └─────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│                  Persistent State                       │
│         (localStorage - survives page reload)           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Draft entries with TTL expiration               │   │
│  │  User preferences (theme, view settings)         │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### React Query Configuration

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})
```

### Draft Persistence Pattern

For incomplete work that should survive page reloads:

```typescript
interface Draft {
  data: Partial<Entry>
  timestamp: number
}

function useDraft(key: string, ttlMs: number = 24 * 60 * 60 * 1000) {
  const [draft, setDraft] = useState<Draft | null>(() => {
    const stored = localStorage.getItem(key)
    if (!stored) return null

    const parsed = JSON.parse(stored) as Draft
    if (Date.now() - parsed.timestamp > ttlMs) {
      localStorage.removeItem(key)
      return null
    }
    return parsed
  })

  const saveDraft = (data: Partial<Entry>) => {
    const draft = { data, timestamp: Date.now() }
    localStorage.setItem(key, JSON.stringify(draft))
    setDraft(draft)
  }

  const clearDraft = () => {
    localStorage.removeItem(key)
    setDraft(null)
  }

  return { draft: draft?.data, saveDraft, clearDraft }
}
```

---

## Development Workflow

### Local Development

```bash
# Install dependencies
pnpm install

# Start all services (frontend + backend)
pnpm dev

# Start individual services
pnpm dev:web    # Frontend only
pnpm dev:api    # Backend only

# Database operations
pnpm db:push    # Push schema changes
pnpm db:studio  # Visual browser
```

### Docker Development

```bash
# Start all services with Docker
docker-compose -f docker-compose.dev.yml up
```

### Build & Deploy

```bash
# Build all packages
pnpm build

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Testing
pnpm test
```

### Environment Variables

**API:**

```env
DATABASE_URL=postgresql://user:password@localhost:5432/db
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
BETTER_AUTH_URL=http://localhost:5173
```

**Web:**

```env
VITE_API_URL=http://localhost:3001
```

---

## Adapting for Other Domains

The architecture is designed to be reusable. Here's how to adapt it:

### 1. Define Your Domain Model

Replace the existing domain tables with your own:

| Application | Primary Entity | Secondary Entities |
|-------------|---------------|-------------------|
| Habit Tracker | `habits`, `completions` | `categories`, `streaks` |
| Budgeting | `transactions` | `accounts`, `categories`, `budgets` |
| Language Learning | `sessions`, `words` | `languages`, `decks`, `progress` |

### 2. Create Domain-Specific Components

```
src/components/
├── habits/                     # Habit tracker
│   ├── HabitCard.tsx
│   ├── StreakDisplay.tsx
│   └── CompletionToggle.tsx
│
├── transactions/               # Budgeting
│   ├── TransactionRow.tsx
│   ├── CategoryBudget.tsx
│   └── SpendingChart.tsx
│
├── vocabulary/                 # Language learning
│   ├── FlashCard.tsx
│   ├── ProgressRing.tsx
│   └── ReviewSession.tsx
```

### 3. Implement Domain-Specific Analytics

Modify the analytics routes for your domain:

```typescript
// Habit tracker
GET /api/analytics/streaks
GET /api/analytics/completion-rate

// Budgeting
GET /api/analytics/spending-by-category
GET /api/analytics/monthly-trends

// Language learning
GET /api/analytics/retention-curve
GET /api/analytics/daily-progress
```

### 4. Customize the Shared Package

Update `packages/shared` with your domain types:

```typescript
// Habit tracker
export type HabitFrequency = "daily" | "weekly" | "monthly"
export interface Habit { id: number; name: string; frequency: HabitFrequency }

// Budgeting
export type TransactionType = "income" | "expense" | "transfer"
export interface Transaction { id: number; amount: number; type: TransactionType }

// Language learning
export type ProficiencyLevel = "beginner" | "intermediate" | "advanced"
export interface Word { id: number; term: string; translation: string }
```

### 5. Retain Core Patterns

Keep these architectural elements regardless of domain:

- **User isolation** via `userId` on all tables
- **Type-safe API responses** with consistent structure
- **React Query** for server state
- **Draft persistence** for incomplete work
- **Soft deletes** for reference data
- **Authentication middleware** on protected routes

---

## Summary

This architecture provides:

- **Type Safety** - TypeScript from database to UI
- **Scalability** - Multi-user support with proper isolation
- **Developer Experience** - Hot reload, path aliases, shared types
- **Maintainability** - Clear separation of concerns
- **Flexibility** - Easy to adapt for different domains

The patterns established here form a solid foundation for any data-driven personal productivity application.
