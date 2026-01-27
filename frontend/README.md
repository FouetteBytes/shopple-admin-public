# Shopple Admin Frontend

The frontend for the Shopple Admin Dashboard, built with Next.js 13 (App Router), React 18, and Tailwind CSS.

## Overview

This dashboard provides the user interface for:
- Managing product classifications
- Viewing crawler status and results
- Handling duplicate detection
- Managing API keys and system configuration

## Running the Application

**⚠️ Important:** The frontend is designed to run inside a Docker container.
Running `npm run dev` manually is **deprecated** as it may lead to environment mismatches.

**To Start:**
```bash
# From the project root
docker-compose up --build frontend
```

### Configuration for Remote Access
If deploying to a remote server, ensure `.env` is configured:
- `NEXT_PUBLIC_BACKEND_URL`: Set to the URL of your backend (e.g., `http://<YOUR_IP>:5001`).
- `FRONTEND_ORIGIN`: Set to the URL of your frontend (e.g., `http://<YOUR_IP>:3000`).

*Note: These variables are passed as build arguments to the Docker container.*

## Feature Modules

The application is structured around key feature modules located in `src/components/`:

### 1. Classifier (`src/components/classifier/`)
UI for the AI product classification pipeline.
- **Real-time Status**: Displays streaming updates from the backend via SSE.
- **Manual Review**: Interface for reviewing and correcting AI classifications.

### 2. Crawler (`src/components/crawler/`)
Control panel for the web crawlers.
- **Job Management**: Start, stop, and monitor crawler jobs.
- **Results View**: Inspect scraped data and download JSON reports.

### 3. Dashboard (`src/components/dashboard/`)
The main landing page widgets.
- **Stats Cards**: High-level metrics (Total Products, Active Crawlers, etc.).
- **Recent Activity**: Timeline of system events.

### 4. Products (`src/components/products/`)
Product management interface.
- **Data Grid**: Sortable, filterable table of all products.
- **Edit/Delete**: CRUD operations for product data.

### 5. Settings (`src/components/settings/`)
System configuration.
- **API Keys**: Secure management of AI provider keys.
- **System Health**: Status of Docker containers and services.

## Directory Structure

```
frontend/
├── src/
│   ├── app/                 # Next.js App Router pages & layouts
│   │   ├── admin/           # Admin routes
│   │   ├── api/             # Internal API routes
│   │   └── ...
│   ├── components/          # React components organized by feature
│   │   ├── classifier/      # Product classification UI
│   │   ├── crawler/         # Crawler control & status UI
│   │   ├── dashboard/       # Main dashboard widgets
│   │   ├── products/        # Product management
│   │   ├── settings/        # System settings & keys
│   │   └── ui/              # Reusable UI elements (shadcn/ui)
│   ├── contexts/            # React Contexts (Auth, Toast)
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Core libraries & utilities
│   │   ├── api.ts           # Backend API client
│   │   ├── firebase.ts      # Firebase client SDK
│   │   └── ...
│   ├── services/            # Frontend services (API wrappers)
│   ├── types/               # TypeScript definitions
│   └── utils/               # Helper functions
├── public/                  # Static assets
└── scripts/                 # Admin setup scripts
    └── admin/               # User management scripts
```

## Key Technologies
- **Framework:** Next.js 13 (App Router)
- **Styling:** Tailwind CSS
- **State Management:** Zustand
- **Data Fetching:** SWR
- **Icons:** Lucide React

