import placeholder from '../assets/avatar-placeholder.svg';

// The real avatar is local-only (gitignored). A fresh clone has none → the placeholder.
const full = import.meta.glob('../assets/private/avatar.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const avatarUrl: string = Object.values(full)[0] ?? placeholder;

// Generated pose variants remain local alongside the original private character artwork.
const poses = import.meta.glob(['../assets/private/avatar-sleepy.png', '../assets/private/avatar-drained.png', '../assets/private/avatar-recovering.png', '../assets/private/avatar-alert.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const avatarPoseUrls = Object.fromEntries(Object.entries(poses).map(([path, url]) => [path.match(/avatar-(.+)\.png$/)![1], url]));
