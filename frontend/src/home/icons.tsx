import type { Icon as TablerIcon } from '@tabler/icons-react';
import { IconActivityHeartbeat, IconBarbell, IconBolt, IconBook2, IconChevronDown, IconChevronRight, IconDatabase, IconDeviceWatch, IconFileText, IconFolder, IconHeart, IconMenu2, IconRefresh, IconRun, IconSchool, IconSearch, IconUser, IconX } from '@tabler/icons-react';

/** Tabler icons (MIT, named imports only) for the Solace Home; decorative, so always aria-hidden. */
const TABLER = {
  run: IconRun,
  strength: IconBarbell,
  pulse: IconActivityHeartbeat,
  folder: IconFolder,
  file: IconFileText,
  book: IconBook2,
  cap: IconSchool,
  db: IconDatabase,
  bolt: IconBolt,
  heart: IconHeart,
  chevron: IconChevronRight,
  caret: IconChevronDown,
  search: IconSearch,
  sync: IconRefresh,
  menu: IconMenu2,
  close: IconX,
  user: IconUser,
  watch: IconDeviceWatch,
} satisfies Record<string, TablerIcon>;

export type IconName = keyof typeof TABLER;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const T: TablerIcon = TABLER[name];
  return <T className="nh-icon" size={size} stroke={1.6} aria-hidden />;
}

/** Solace mark (drawn for this project): an open ring around a rising sun disc, over a terminal bar. */
export function Emblem({ size = 56 }: { size?: number }) {
  return (
    <svg className="nh-emblem" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="60 8 60 8 40 6" transform="rotate(-70 32 32)" />
      <path d="M18 40a14 14 0 0 1 28 0z" fill="currentColor" />
      <path d="M32 12v8M18 22l5 5M46 22l-5 5" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
      <path d="M16 47h32M22 53h20" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
    </svg>
  );
}
