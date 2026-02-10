# AI Asset Manager - Frontend

Next.js 14 frontend application for AI Asset Manager with authentication.

## Features

- **Next.js 14** with App Router and TypeScript
- **Authentication** with JWT (SimpleJWT integration)
- **State Management** with Zustand
- **Styling** with Tailwind CSS
- **Automatic Token Refresh** - Access tokens refresh automatically when expired
- **Protected Routes** - Client-side route protection

## Project Structure

```
frontend/
├── app/                    # Next.js App Router pages
│   ├── login/             # Login page
│   ├── register/          # Registration page
│   ├── projects/          # Projects dashboard (protected)
│   ├── layout.tsx         # Root layout with AuthProvider and Navbar
│   └── page.tsx           # Home page (redirects based on auth)
├── components/            # React components
│   ├── AuthProvider.tsx   # Auth state initialization
│   └── Navbar.tsx         # Navigation bar
├── lib/                   # Core utilities
│   ├── api.ts            # API client with JWT handling
│   └── store/
│       └── auth.ts       # Zustand auth store
└── middleware.ts         # Next.js middleware

```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Backend API running (default: `http://localhost:8000`)

### Installation

```bash
cd frontend
npm install
```

### Environment Variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Authentication Flow

1. **Login/Register** - User enters credentials
2. **Token Storage** - JWT tokens stored in localStorage
   - Access token (5 min TTL)
   - Refresh token (1 day TTL)
3. **Automatic Refresh** - API client automatically refreshes access token on 401
4. **Protected Routes** - Pages check auth state and redirect if needed

## API Client

The API client (`lib/api.ts`) handles:

- JWT token management
- Automatic token refresh on 401 responses
- Request/response interceptors
- Error handling

Example usage:

```typescript
import { apiClient } from '@/lib/api';

// Login
await apiClient.login('username', 'password');

// Get current user
const user = await apiClient.getMe();

// Make authenticated request
const data = await apiClient.request('/api/projects/');
```

## Auth Store

Zustand store for auth state (`lib/store/auth.ts`):

```typescript
import { useAuthStore } from '@/lib/store/auth';

const { user, isAuthenticated, login, logout } = useAuthStore();
```

## Pages

- `/` - Home (redirects to `/login` or `/projects`)
- `/login` - Login page
- `/register` - Registration page
- `/projects` - Projects dashboard (protected)

## Next Steps (V1 Frontend Tasks)

- Task 6: Dashboard (Projects) - Full project CRUD
- Task 7: Project View (Boxes grid)
- Task 8: Box Detail (Assets + Generation)
