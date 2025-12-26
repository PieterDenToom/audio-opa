# Deployment to Cloudflare Pages

This guide explains how to deploy the audio player application to Cloudflare Pages with password protection.

## Prerequisites

1. A Cloudflare account
2. Your code pushed to a Git repository (GitHub, GitLab, etc.)

## Setup Steps

### 1. Install Dependencies

The Cloudflare adapter is already installed. Make sure all dependencies are installed:

```bash
npm install
```

### 2. Configure Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** > **Create application** > **Pages**
3. Select **Connect to Git** and authorize Cloudflare to access your repository
4. Choose your repository and branch

### 3. Build Settings

Configure the following build settings:

- **Framework preset**: SvelteKit
- **Build command**: `npm run build`
- **Build output directory**: `.svelte-kit/cloudflare`

### 4. Environment Variables

Set the password environment variable:

1. In your Pages project, go to **Settings** > **Environment variables**
2. Add a new variable:
   - **Variable name**: `SITE_PASSWORD`
   - **Value**: Your desired password
   - **Environment**: Production (and Preview if you want it there too)

⚠️ **Important**: Make sure to set `SITE_PASSWORD` in the environment variables section, not in a `.env` file, as the `.env` file won't be available at runtime on Cloudflare Pages.

### 5. Deploy

Click **Save and Deploy**. Your site will be built and deployed automatically.

## How Password Protection Works

- When a user visits your site, they are redirected to `/login` if not authenticated
- The login page checks the password against the `SITE_PASSWORD` environment variable
- Upon successful login, a secure HTTP-only cookie is set for 24 hours
- The cookie is checked on each request via `src/hooks.server.ts`

## Local Development

For local development, create a `.env` file in the root directory:

```env
SITE_PASSWORD=your-local-password
```

Note: The authentication uses `platform.env` (Cloudflare) or `process.env` (local) to access the password.

