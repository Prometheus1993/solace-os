import placeholder from '../assets/avatar-placeholder.svg';

// The avatar lives in assets/private; the placeholder is the fallback when the file is missing.
const full = import.meta.glob('../assets/private/avatar.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export const avatarUrl: string = Object.values(full)[0] ?? placeholder;

// Generated pose variants sit next to the original avatar; a missing file falls back to the placeholder.
const poses = import.meta.glob(['../assets/private/avatar-sleepy.png', '../assets/private/avatar-drained.png', '../assets/private/avatar-recovering.png', '../assets/private/avatar-alert.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const avatarPoseUrls = Object.fromEntries(Object.entries(poses).map(([path, url]) => [path.match(/avatar-(.+)\.png$/)![1], url]));
