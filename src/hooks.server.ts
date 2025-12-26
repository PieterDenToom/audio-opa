import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	// Allow login route and static assets
	if (event.url.pathname.startsWith('/login') || event.url.pathname.startsWith('/_app') || event.url.pathname.startsWith('/audio')) {
		return resolve(event);
	}

	// Check for authentication cookie
	const authToken = event.cookies.get('auth_token');

	if (authToken !== 'authenticated') {
		// Redirect to login page
		return new Response(null, {
			status: 302,
			headers: {
				'Location': '/login',
			},
		});
	}

	return resolve(event);
};

