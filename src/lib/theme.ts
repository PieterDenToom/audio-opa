import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'theme';

export function getTheme(): Theme {
	if (!browser) return 'light';
	
	const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
	if (stored === 'light' || stored === 'dark') {
		return stored;
	}
	
	// Fall back to system preference
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setTheme(theme: Theme) {
	if (!browser) return;
	
	localStorage.setItem(THEME_STORAGE_KEY, theme);
	applyTheme(theme);
	
	// Dispatch storage event so other tabs/windows can sync
	window.dispatchEvent(new StorageEvent('storage', {
		key: THEME_STORAGE_KEY,
		newValue: theme,
		storageArea: localStorage
	}));
}

export function applyTheme(theme: Theme) {
	if (!browser) return;
	
	const root = document.documentElement;
	if (theme === 'dark') {
		root.classList.add('dark');
	} else {
		root.classList.remove('dark');
	}
}

export function initTheme() {
	if (!browser) return;
	
	const theme = getTheme();
	applyTheme(theme);
	
	// Listen for system theme changes (only when no manual preference is set)
	const stored = localStorage.getItem(THEME_STORAGE_KEY);
	if (!stored) {
		window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
			if (!localStorage.getItem(THEME_STORAGE_KEY)) {
				applyTheme(e.matches ? 'dark' : 'light');
			}
		});
	}
}

