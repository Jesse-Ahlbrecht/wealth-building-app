# Agent Coding Philosophy

# Approach
We are building v 1.0 so backward compatibility of changes doesn't matter! I REPEAT NEVER CARE ABOUT BACKWARD COMPATIBILITY! ‚Whatever solution is fastest and simplest should be implemented. Keep the application as modular as possible.

## Mission & Scope

We are building a personal wealth management tool that ingests sensitive banking statements, normalizes them, and delivers a responsive, frontend-first experience. Every design decision prioritizes confidentiality, integrity, and speed while keeping the deployment lightweight enough to run on a hardened single-VM footprint.

## Architectural Principles

- **Frontend-first data shaping**: After the API authenticates and authorizes a request, it returns the user’s full data domain (transactions, accounts, projections). Filtering, aggregation, and visualization happen in the React SPA using memoized selectors to keep latency low.
- **Zero implicit trust**: Treat every boundary–browser, API, database, object storage–as hostile by default. Enforce explicit authn/authz, signed payloads, and  encryption (server) for statement artifacts.
- **Stateless API surface**: Flask endpoints remain idempotent and stateless aside from encrypted storage operations. Session affinity lives in short-lived JWT/PASETO tokens validated per call.
- **Separation of concerns**: Keep ingestion/parsing helpers pure and testable. Route functions should orchestrate parsers, encryption helpers, and response formatters without embedding business logic.

## Security & Data Handling

- **Encryption**: AES-256 everywhere—`pgcrypto` for columnar data, AES-GCM for file blobs, and HMAC signatures on API payloads. Keys originate from cloud KMS, never from environment files.
- **Key rotation**: Expose helper utilities to rotate DEKs/KEKs without downtime. Application code must be resilient to key version mismatches by looking up the active key before decrypt operations.
- **Secrets hygiene**: No secrets in git. Use instance metadata/managed identities for runtime credential retrieval. When developing locally, store secrets in `.env.local` that is explicitly git-ignored.
- **Least privilege**: Backend IAM role can read specific prefixes in object storage and manage only the database targeted schemas. Frontend uses per-user scoped tokens; never expose global identifiers to the browser.

## Coding Standards

- **Backend (Python/Flask)**
  - Type hint all public functions, run `mypy` in strict mode for new modules.
  - Use dependency injection for services (encryption, storage, database) to keep tests deterministic.
  - Log with structured JSON (request id, user id, correlation id) and avoid logging PII.
  - Enforce lint via `ruff` and formatting via `black` (line length 100) before commit.
- **Frontend (React)**
  - Keep components presentational; move data shaping into hooks/selectors.
  - Prefer React Query for data fetching/caching; the API returns cache-friendly ETags.
  - Use TypeScript definitions generated from the OpenAPI spec to stay in sync with the backend.
  - Sanitize and escape all user-visible fields; never trust data even after decryption.

## Testing & Quality Gates

- **Unit tests**: Cover parsers, encryption utilities, and API contracts. Mock KMS interactions to avoid leaking real keys.
- **Integration tests**: Spin up a disposable Postgres container with `pgcrypto` enabled; run ingestion flows end-to-end using fixture statements.
- **Security tests**: Include dependency scanning (pip-audit, npm audit) and automated SAST (Bandit, Semgrep). Plan for periodic threat modeling sessions and tabletop exercises for key compromise.
- **Performance checks**: Profile the frontend bundle (Lighthouse target ≥ 90) and API latency (p95 < 200 ms for typical dataset). Ensure AES operations are hardware-accelerated (AES-NI/GCM).

## Operational Playbook

- **Deployments**: Deliver via CI/CD pipeline that builds immutable artifacts, runs the full test suite, and deploys with canary checks behind nginx health probes.
- **Observability**: Emit metrics for ingestion success, encryption/decryption failures, and frontend hydration timing. Alert on anomalous decrypt counts or large payload downloads.
- **Incident response**: Maintain runbooks for data corruption, key compromise, and unexpected client desync. First steps always rotate keys, snapshot the database, and isolate the VM.

## UI/UX Styling Guidelines

The application uses a consistent design system built on CSS custom properties (CSS variables) for theming and maintainability. All styling follows these principles:

### Design System Architecture

- **CSS Variables**: All colors, spacing, shadows, and transitions are defined as CSS custom properties in `frontend/src/App.css`, enabling easy theme switching (light/dark mode).
- **Component Classes**: Reusable CSS classes follow a naming convention: `{component}-{element}-{modifier}` (e.g., `documents-confirm-modal`, `documents-primary-button`).
- **Consistent Spacing**: Use standardized padding/margin values (8px, 12px, 16px, 20px, 24px, 28px) for visual rhythm.
- **Transitions**: All interactive elements include smooth transitions (typically 0.2s-0.3s ease) for color, background, border, and transform changes.

### Color System

**Light Theme:**
- Primary accent: `--color-accent-secondary` (#6366f1 - indigo)
- Backgrounds: `--color-bg-card`, `--color-bg-tertiary`, `--color-bg-hover`
- Text: `--color-text-primary` (#1a1a1a), `--color-text-tertiary` (#64748b), `--color-text-muted` (#666)
- Borders: `--color-border-primary` (#e5e7eb), `--color-border-secondary`, `--color-border-hover`

**Dark Theme:**
- Primary accent: `--color-accent-secondary` (#818cf8 - lighter indigo)
- Backgrounds: Darker variants of light theme backgrounds
- Text: Inverted text colors for contrast
- Borders: Darker, more subtle borders

### Modal Patterns

Modals follow a consistent structure:
- **Overlay**: `.modal-overlay` with backdrop blur/opacity
- **Content**: `.modal-content` with rounded corners (12px), shadow, and max-width constraints
- **Header**: `.documents-confirm-header` with title and close button
- **Actions**: `.documents-confirm-actions` flex container with button spacing

**Modal Button Styles:**
- **Cancel/Secondary**: `.documents-cancel-button` - outlined style with border, transparent background
- **Primary/Action**: `.documents-primary-button` - solid background using `--color-accent-secondary`, white text, hover effects

### Button Patterns

- **Primary Actions**: Use `.documents-primary-button` for main actions (upload, confirm, save)
  - Background: `var(--color-accent-secondary)`
  - Text: White
  - Hover: Slight opacity reduction (0.9) and translateY(-1px) for elevation
  - Active: Reset translateY, slight opacity increase
  
- **Secondary Actions**: Use `.documents-cancel-button` for cancel/dismiss actions
  - Background: `var(--color-bg-card)`
  - Border: `var(--color-border-primary)`
  - Hover: `var(--color-bg-hover)` background

- **Menu Items**: Use `.document-card-menu-item` for dropdown menu items
  - Transparent background, hover state with `var(--color-bg-hover)`
  - Danger variant: `.document-card-menu-item.danger` with error colors

### Typography

- **Headings**: Font-weight 600, appropriate sizing (h2: 28px, h3: 21px)
- **Body Text**: Font-size 14px-16px, line-height 1.5
- **Labels/Meta**: Font-size 13px, color `var(--color-text-tertiary)`
- **Monospace**: Used for filenames and technical data

### Spacing & Layout

- **Card Padding**: 20px-28px for main content areas
- **Section Gaps**: 20px-32px between major sections
- **Element Gaps**: 8px-12px for related elements
- **Border Radius**: 8px for cards/buttons, 12px for modals

### Interactive States

All interactive elements must include:
- **Hover**: Background color change, border color change, slight elevation (translateY)
- **Active**: Reset elevation, slight opacity change
- **Disabled**: Reduced opacity (0.5), `cursor: not-allowed`, no hover effects
- **Focus**: Browser default focus rings (consider custom focus styles for accessibility)

### Best Practices

1. **Avoid Inline Styles**: Use CSS classes and CSS variables instead of inline styles for maintainability
2. **Consistent Transitions**: Always include transitions for color, background, border, and transform changes
3. **Dark Mode Support**: Ensure all new styles work in both light and dark themes using CSS variables
4. **Accessibility**: Maintain sufficient color contrast ratios (WCAG AA minimum)
5. **Responsive**: Use relative units (rem, em, %) and flexbox/grid for responsive layouts
6. **Component Isolation**: Style components within their own class namespace to avoid conflicts

### Example: Styling a New Modal

```css
/* Modal container */
.my-feature-modal {
  padding: 28px;
  box-sizing: border-box;
}

.my-feature-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 20px;
}

.my-feature-header h3 {
  font-size: 21px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 8px 0;
  transition: color 0.3s ease;
}

.my-feature-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.my-feature-primary-btn {
  padding: 10px 18px;
  border-radius: 8px;
  border: none;
  background: var(--color-accent-secondary);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s ease, opacity 0.2s ease, transform 0.2s ease;
}

.my-feature-primary-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}
```

This document is the authoritative guide for contributors and automation agents. Keep it updated whenever architecture, security posture, coding standards, or styling patterns evolve.

