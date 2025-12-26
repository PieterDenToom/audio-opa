import { redirect, fail } from '@sveltejs/kit';
import type { Actions } from './$types';

function getSitePassword(platform: App.Platform | undefined): string {
	// On Cloudflare, environment variables are accessed via platform.env
	if (platform?.env?.SITE_PASSWORD) {
		return platform.env.SITE_PASSWORD;
	}
	
	// For local development, check process.env (Node.js runtime)
	// Note: On Cloudflare Workers runtime, process.env is not available
	if (typeof process !== 'undefined' && process.env?.SITE_PASSWORD) {
		return process.env.SITE_PASSWORD;
	}
	
	return '';
}

export const actions: Actions = {
	default: async ({ request, cookies, platform }) => {
		const formData = await request.formData();
		const password = formData.get('password')?.toString() || '';
		const sitePassword = getSitePassword(platform);

		if (!sitePassword) {
			console.error('SITE_PASSWORD environment variable is not set');
			return fail(500, { error: 'Server configuration error' });
		}

		if (password === sitePassword) {
			// Set authentication cookie (24 hours)
			cookies.set('auth_token', 'authenticated', {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 60 * 60 * 24,
			});
			throw redirect(302, '/');
		} else {
			return fail(401, { error: 'Onjuist wachtwoord' });
		}
	},
};

