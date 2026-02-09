# Shopple Admin Dashboard - Frontend

Enterprise-grade administrative interface for the Shopple e-commerce intelligence platform. Built with Next.js 14 (App Router), React 18, TypeScript, and Tailwind CSS.

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Directory Structure](#directory-structure)
- [Core Features](#core-features)
- [Configuration](#configuration)
- [Authentication](#authentication)
- [API Integration](#api-integration)
- [Development](#development)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Shopple Admin Dashboard is a full-stack administrative interface for managing:

- **Product Intelligence**: AI-powered classification, duplicate detection, and matching
- **Web Crawlers**: Automated data extraction from e-commerce sites (Keells, Cargills)
- **Pricing Analytics**: Price tracking, trend analysis, and upload management
- **User Management**: Role-based access control (Admin/Super Admin)
- **System Operations**: Cache management, audit logs, and system health monitoring

This frontend application communicates with a Python Flask backend and uses Firebase for authentication and real-time data synchronization.

---

## Tech Stack

### Core Framework
- **Next.js 14.2** - React framework with App Router, Server Components, and SSR
- **React 18.2** - UI library with Concurrent Features
- **TypeScript 5** - Type safety and enhanced developer experience

### Styling & UI
- **Tailwind CSS 3** - Utility-first CSS framework
- **Framer Motion 10** - Animation library for transitions and gestures
- **Lucide React** - Modern icon library
- **Iconsax React** - Additional icon set for specialized UI elements

### State Management & Data Fetching
- **Zustand 4.4** - Lightweight state management
- **SWR 2.3** - Data fetching with caching, revalidation, and optimistic updates

### Backend Integration
- **Firebase 11.10** - Authentication, Firestore real-time database, Cloud Storage
- **Firebase Admin 13.4** - Server-side Firebase operations
- **Custom REST API Client** - Typed HTTP client for Python backend

### Data Visualization
- **Recharts 3.1** - Composable charting library for analytics dashboards

### Additional Libraries
- **date-fns 4.1** - Modern date utility library
- **SQL.js 1.13** - SQLite compiled to WebAssembly for client-side queries
- **Sharp 0.34** - High-performance image processing

---

## Architecture

### Application Structure

```
┌─────────────────┐
│  Next.js App    │
│  (Port 3000)    │
└────────┬────────┘
         │
    ┌────┴────────────────┬──────────────┐
    │                     │              │
┌───▼────────┐    ┌──────▼─────┐   ┌───▼────────┐
│  Firebase  │    │   Python   │   │   Fluent   │
│   Auth +   │    │   Backend  │   │    Bit     │
│ Firestore  │    │ (Port 5001)│   │  Logging   │
└────────────┘    └────────────┘   └────────────┘
```

### Request Flow

1. **Client → Next.js Middleware**: Session validation via `SessionManager`
2. **Next.js → Firebase**: Authentication state management
3. **Next.js → Backend API**: Authenticated requests with session cookies
4. **Backend → Firestore**: Data persistence and real-time sync
5. **Client ← Firestore**: Direct real-time updates via Firebase SDK

### Authentication Architecture

- **Session-based auth** with HTTP-only cookies (secure, non-persistent)
- **Firebase ID tokens** for API authentication
- **Custom claims** for role-based access (admin, super_admin)
- **CSRF protection** on state-changing operations
- **Session sync** across tabs via BroadcastChannel API

---

## Prerequisites

- **Docker & Docker Compose** (recommended deployment method)
- **Node.js 20+** (for local development only)
- **Firebase Project** with Authentication and Firestore enabled
- **Python Backend** running on port 5001 (see `../backend/README.md`)

---

## Getting Started

### Production Deployment (Recommended)

```bash
# From project root
docker-compose up --build frontend

# Access at http://localhost:3000
```

### Local Development (Optional)

⚠️ **Not recommended**: Docker deployment ensures environment consistency.

```bash
cd frontend
npm install
npm run dev
```

---

## Directory Structure

```
frontend/
├── public/                        # Static assets served at root
│   ├── env-config.js              # Runtime environment configuration
│   ├── clear-storage.js           # Client-side cache clearing utility
│   └── sql-wasm.js                # SQLite WebAssembly binary
│
├── src/
│   ├── app/                       # Next.js App Router (file-based routing)
│   │   ├── layout.tsx             # Root layout with providers
│   │   ├── page.tsx               # Landing page (redirects to /app or /admin/login)
│   │   │
│   │   ├── admin/                 # Public admin routes
│   │   │   └── login/             # Authentication page
│   │   │
│   │   ├── app/                   # Protected application routes
│   │   │   ├── layout.tsx         # Authenticated app shell
│   │   │   ├── dashboard/         # Analytics dashboard
│   │   │   ├── products/          # Product management
│   │   │   ├── pricing/           # Price tracking & uploads
│   │   │   ├── classifier/        # AI classification pipeline
│   │   │   ├── crawler/           # Web scraper controls
│   │   │   ├── cache/             # Cache management
│   │   │   ├── audit/             # System audit logs
│   │   │   ├── history/           # Historical data viewer
│   │   │   ├── users/             # User management
│   │   │   ├── teams/             # Team management
│   │   │   ├── settings/          # System configuration
│   │   │   ├── support/           # Help & support
│   │   │   ├── admin/             # Admin-only controls
│   │   │   └── product-requests/  # User product requests
│   │   │
│   │   └── api/                   # Next.js API routes (backend proxies)
│   │       ├── admin/             # Admin operations
│   │       ├── auth/              # Authentication endpoints
│   │       └── crawler/           # Crawler operations
│   │
│   ├── components/                # React components (organized by feature)
│   │   ├── auth/                  # Authentication components
│   │   │   ├── AdminLogin.tsx                # Login form
│   │   │   ├── AdminProtectedRoute.tsx       # Route guard HOC
│   │   │   ├── AdminAccountFactory.tsx       # User provisioning UI
│   │   │   └── EnhancedSessionGuard.tsx      # Session validation
│   │   │
│   │   ├── dashboard/             # Dashboard widgets
│   │   │   ├── StatsCard.tsx              # Metric cards
│   │   │   ├── ActivityTimeline.tsx       # Recent events
│   │   │   └── SystemHealthPanel.tsx      # Service status
│   │   │
│   │   ├── products/              # Product management
│   │   │   ├── ProductGrid.tsx            # Data table
│   │   │   ├── ProductEditor.tsx          # Edit form
│   │   │   ├── DuplicateDetector.tsx      # Duplicate finder
│   │   │   └── BulkUploader.tsx           # Batch import
│   │   │
│   │   ├── pricing/               # Price management
│   │   │   ├── PriceChart.tsx             # Trend visualization
│   │   │   ├── UploadPricesView.tsx       # Price upload form
│   │   │   └── PriceAnalytics.tsx         # Statistical analysis
│   │   │
│   │   ├── classifier/            # AI classification
│   │   │   ├── ClassificationQueue.tsx    # Processing queue
│   │   │   ├── ManualReview.tsx           # Human review interface
│   │   │   └── CategoryManager.tsx        # Category mapping
│   │   │
│   │   ├── crawler/               # Web scraping
│   │   │   ├── CrawlerControls.tsx        # Start/stop controls
│   │   │   ├── JobMonitor.tsx             # Real-time status
│   │   │   └── SchedulerConfig.tsx        # Automated scheduling
│   │   │
│   │   ├── cache/                 # Cache management
│   │   │   ├── CacheViewer.tsx            # Cache inspection
│   │   │   ├── CacheSync.tsx              # Manual sync controls
│   │   │   └── CacheStats.tsx             # Hit/miss metrics
│   │   │
│   │   ├── audit/                 # Audit logging
│   │   │   └── AuditLogViewer.tsx         # Filterable log viewer
│   │   │
│   │   ├── users/                 # User management
│   │   │   ├── UserTable.tsx              # User list
│   │   │   └── UserEditor.tsx             # User CRUD
│   │   │
│   │   ├── settings/              # System settings
│   │   │   ├── ApiKeyManager.tsx          # AI provider keys
│   │   │   ├── SystemConfig.tsx           # App configuration
│   │   │   └── BackupRestore.tsx          # Data operations
│   │   │
│   │   ├── ui/                    # Reusable UI primitives
│   │   │   ├── Button.tsx                 # Button component
│   │   │   ├── Card.tsx                   # Card container
│   │   │   ├── Modal.tsx                  # Modal dialog
│   │   │   ├── Spinner.tsx                # Loading indicator
│   │   │   └── Toast.tsx                  # Notification toast
│   │   │
│   │   ├── layout/                # Layout components
│   │   │   ├── Sidebar.tsx                # Navigation sidebar
│   │   │   ├── Header.tsx                 # Top header bar
│   │   │   └── Footer.tsx                 # Footer
│   │   │
│   │   └── shared/                # Cross-feature components
│   │       ├── DataTable.tsx              # Generic table
│   │       ├── SearchBar.tsx              # Search input
│   │       └── FileUploader.tsx           # File upload widget
│   │
│   ├── contexts/                  # React Context providers
│   │   ├── AuthContext.tsx                # Authentication state
│   │   ├── FirebaseAuthContext.tsx        # Firebase auth wrapper
│   │   └── ToastContext.tsx               # Global notifications
│   │
│   ├── hooks/                     # Custom React hooks
│   │   ├── useDashboardData.ts            # Dashboard data fetching
│   │   ├── useDebounce.ts                 # Input debouncing
│   │   └── useToast.ts                    # Toast notifications
│   │
│   ├── lib/                       # Core libraries & utilities
│   │   ├── api.ts                         # REST API client
│   │   ├── firebase.ts                    # Firebase SDK initialization
│   │   ├── firebase-admin-enhanced.ts     # Server-side Firebase
│   │   ├── auth.ts                        # Authentication utilities
│   │   ├── session-manager.ts             # Session lifecycle
│   │   ├── session-sync.ts                # Cross-tab sync
│   │   ├── csrf-protection.ts             # CSRF token management
│   │   ├── security-manager.ts            # Security utilities
│   │   ├── password-security.ts           # Password validation
│   │   ├── audit-logger.ts                # Audit log client
│   │   ├── frontend-logger.ts             # Structured logging
│   │   ├── database.ts                    # Client-side DB (SQL.js)
│   │   ├── requestCache.ts                # Request caching
│   │   ├── productSearchApi.ts            # Product search
│   │   ├── productRequestApi.ts           # Product requests
│   │   ├── productDetectionSocket.ts      # WebSocket client
│   │   ├── userManagementApi.ts           # User operations
│   │   └── crawler-path.ts                # Crawler utilities
│   │
│   ├── services/                  # Service layer (business logic)
│   │   ├── firebaseService.ts             # Firebase operations
│   │   └── realFirebaseService.ts         # Real-time sync
│   │
│   ├── types/                     # TypeScript type definitions
│   │   ├── classification.ts              # Classification types
│   │   └── crawler.ts                     # Crawler types
│   │
│   └── utils/                     # Helper functions
│       ├── avatar.ts                      # Avatar generation
│       ├── cache.ts                       # Cache utilities
│       ├── chartUtils.ts                  # Chart helpers
│       ├── datetime.ts                    # Date formatting
│       ├── files.ts                       # File operations
│       └── format.ts                      # Data formatting
│
├── middleware.ts                  # Next.js middleware (auth guard)
├── next.config.js                 # Next.js configuration
├── tailwind.config.ts             # Tailwind CSS configuration
├── tsconfig.json                  # TypeScript configuration
├── postcss.config.js              # PostCSS plugins
├── .eslintrc.json                 # ESLint rules
├── package.json                   # Dependencies & scripts
├── Dockerfile                     # Container definition
└── entrypoint.sh                  # Container startup script
```

---

## Core Features

### 1. **Product Management**
- **Intelligent Matching**: AI-powered duplicate detection across retailers
- **Bulk Operations**: Batch upload, edit, and delete
- **Classification Pipeline**: Automated categorization with manual review
- **Image Management**: Upload, crop, and optimize product images
- **Search & Filter**: Advanced filtering by category, retailer, price range

### 2. **Pricing Intelligence**
- **Price Tracking**: Historical price data with trend analysis
- **Bulk Price Upload**: CSV/Excel import with validation
- **Price Analytics**: Statistical analysis and visualizations
- **Real-time Updates**: Live price changes via WebSocket

### 3. **Web Crawling**
- **Automated Scheduling**: Cron-like scheduler for recurring jobs
- **Manual Control**: Start, stop, and monitor individual jobs
- **Multi-retailer Support**: Keells, Cargills with extensible architecture
- **Job History**: Complete audit trail of crawler executions
- **Error Handling**: Automatic retry with exponential backoff

### 4. **User & Access Control**
- **Role-based Access**: Admin and Super Admin roles
- **Session Management**: Secure, server-side session handling
- **Account Provisioning**: UI-based user creation with password policies
- **Audit Logging**: Track all administrative actions

### 5. **System Operations**
- **Cache Management**: Manual sync, invalidation, and inspection
- **System Health**: Real-time service status monitoring
- **Audit Logs**: Comprehensive activity logging with filtering
- **API Key Management**: Secure storage for AI provider keys

---

## Configuration

### Environment Variables

Create a `.env.local` file (local development) or configure container environment (production):

```bash
# Backend API
NEXT_PUBLIC_BACKEND_URL=http://localhost:5001        # Client-side backend URL
INTERNAL_BACKEND_URL=http://backend:5001             # Server-side backend URL (Docker)

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

# Firebase Admin (Server-side)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Security
SESSION_SECRET=your-random-secret-key-min-32-chars
CSRF_SECRET=another-random-secret-key

# Application
NODE_ENV=production
FRONTEND_ORIGIN=http://localhost:3000
```

### Runtime Configuration

For containerized deployments, `public/env-config.js` allows runtime configuration without rebuilding the image:

```javascript
window.__ENV__ = {
  NEXT_PUBLIC_BACKEND_URL: 'http://your-backend-url:5001'
};
```

This file is generated by the `entrypoint.sh` script from environment variables.

---

## Authentication

### Flow Overview

1. **Login**: User enters credentials → Firebase Authentication validates
2. **ID Token**: Firebase returns signed JWT with custom claims (admin, super_admin)
3. **Session Creation**: Next.js API creates HTTP-only session cookie
4. **Middleware**: All `/app/*` routes validated by middleware
5. **API Requests**: Session cookie sent with backend requests
6. **Token Refresh**: Automatic silent refresh before expiration (55 min)

### Custom Claims

```typescript
{
  admin: boolean,          // Standard admin privileges
  super_admin: boolean,    // Full system access + user provisioning
  email: string,
  uid: string
}
```

### Protected Routes

- `/app/*` - Requires authentication (middleware enforced)
- `/app/admin/*` - Requires super_admin claim
- `/admin/login` - Public login page
- `/api/admin/*` - Requires super_admin claim

---

## API Integration

### Backend Communication

The `api.ts` module provides a typed HTTP client for the Python Flask backend:

```typescript
import { authenticatedFetch } from '@/lib/api';

// Authenticated GET request
const products = await authenticatedFetch('/api/products');

// POST with JSON body
const result = await authenticatedFetch('/api/products', {
  method: 'POST',
  body: JSON.stringify({ name: 'Product' }),
  headers: { 'Content-Type': 'application/json' }
});
```

### Real-time Data

Firebase Firestore provides real-time synchronization for:
- Product updates
- Cache status
- User activity
- System statistics

```typescript
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const unsubscribe = onSnapshot(
  collection(db, 'products'),
  (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        console.log('New product:', change.doc.data());
      }
    });
  }
);
```

---

## Development

### NPM Scripts

```bash
npm run dev      # Start development server (port 3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Code Style

- **TypeScript**: Strict mode enabled
- **ESLint**: Next.js recommended rules
- **Prettier**: Automatic formatting (if configured)
- **Import Order**: Absolute imports via `@/` alias

### Component Development

Follow the established patterns:

```typescript
// Feature component example
'use client'; // Mark as Client Component if using hooks/interactivity

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalToast } from '@/contexts/ToastContext';
import { authenticatedFetch } from '@/lib/api';

export default function MyFeature() {
  const { user } = useAuth();
  const { success, error } = useGlobalToast();
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    try {
      setLoading(true);
      const result = await authenticatedFetch('/api/endpoint');
      success('Success', 'Operation completed');
    } catch (err) {
      error('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Component JSX */}
    </div>
  );
}
```

---

## Deployment

### Docker Deployment (Recommended)

```bash
# Build and start
docker-compose up --build frontend

# Stop
docker-compose down

# View logs
docker-compose logs -f frontend
```

### Kubernetes Deployment

See `../k8s/README.md` for complete Kubernetes deployment instructions.

Key considerations:
- **Ingress**: Configure path-based routing for `/` (frontend) and `/api` (backend)
- **Environment**: Use ConfigMaps and Secrets for environment variables
- **Replicas**: Frontend is stateless and can scale horizontally
- **Health Checks**: Readiness probe on `/api/health` (if implemented)

### Vercel/Netlify Deployment

Not recommended due to tight Docker integration, but possible with modifications:

1. Remove Docker-specific scripts from `entrypoint.sh`
2. Configure build environment variables directly in platform
3. Ensure backend API is accessible from the platform's network
4. Configure serverless function timeouts for long-running operations

---

## Troubleshooting

### Common Issues

#### 1. **"Failed to fetch backend"**
- **Cause**: Backend not running or incorrect `NEXT_PUBLIC_BACKEND_URL`
- **Solution**: Verify backend is running on port 5001 and URL is correct
- **Check**: `curl http://localhost:5001/health`

#### 2. **"Firebase configuration error"**
- **Cause**: Missing or incorrect Firebase environment variables
- **Solution**: Verify all `NEXT_PUBLIC_FIREBASE_*` variables are set
- **Check**: Open browser console and look for Firebase initialization errors

#### 3. **"Session expired" on every page load**
- **Cause**: Session cookie not being set (HTTPS/domain mismatch)
- **Solution**: Ensure `FRONTEND_ORIGIN` matches the actual frontend URL
- **Check**: Open DevTools → Application → Cookies

#### 4. **Images not loading**
- **Cause**: Firebase Storage CORS not configured
- **Solution**: Add your domain to Firebase Storage CORS rules
- **Check**: Network tab shows 404 or CORS errors

#### 5. **"Unauthorized" on API calls**
- **Cause**: Session cookie not sent or token expired
- **Solution**: Hard refresh (Ctrl+Shift+R) to clear stale session
- **Check**: Network tab → Request Headers should include `Cookie`

#### 6. **Build fails with "Module not found"**
- **Cause**: Missing dependency or import path error
- **Solution**: Run `npm install` and verify import paths use `@/` alias
- **Check**: Ensure `tsconfig.json` has `"paths": { "@/*": ["./src/*"] }`

### Debug Mode

Enable verbose logging:

```bash
# In .env.local
NEXT_PUBLIC_DEBUG=true
```

This will output detailed logs to the browser console for:
- API requests/responses
- Firebase operations
- Session management
- Cache operations

---

## Contributing

### Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make changes following the code style
3. Test thoroughly in Docker environment
4. Submit pull request with detailed description

### Testing Checklist

- [ ] Authentication flow works (login, logout, session refresh)
- [ ] Protected routes redirect to login when unauthenticated
- [ ] API calls include session cookies
- [ ] Real-time updates work (Firestore listeners)
- [ ] Images optimize correctly
- [ ] Mobile responsive design
- [ ] No console errors
- [ ] Docker build succeeds
- [ ] Environment variables documented

---

## Support

For issues or questions:
- **Backend Issues**: See `../backend/README.md`
- **Deployment**: See `../k8s/README.md`

