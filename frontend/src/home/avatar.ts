import placeholder from '../assets/avatar-placeholder.svg';

// The avatar lives in assets/private; the placeholder is the fallback when the file is missing.
const full = import.meta.glob('../assets/private/avatar.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const avatarUrl: string = Object.values(full)[0] ?? placeholder;

