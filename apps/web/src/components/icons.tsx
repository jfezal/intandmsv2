import type { SVGProps } from 'react';
import type { FileKind } from '../lib/format';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Svg {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></Svg>
);
export const IconFolder = (p: IconProps) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></Svg>
);
export const IconFolderOpen = (p: IconProps) => (
  <Svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1" /><path d="M3 19 5.5 11h16L19 19Z" /></Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Svg>
);
export const IconTasks = (p: IconProps) => (
  <Svg {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11M3.5 18l1.5 1.5 2.5-2.5" /></Svg>
);
export const IconUsers = (p: IconProps) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6" /></Svg>
);
export const IconServer = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01" /></Svg>
);
export const IconShield = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6Z" /><path d="m9 12 2 2 4-4" /></Svg>
);
export const IconMessage = (p: IconProps) => (
  <Svg {...p}><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1Z" /><path d="M8 10h8M8 13h5" /></Svg>
);
export const IconSend = (p: IconProps) => (
  <Svg {...p}><path d="M4 12 20 4l-6 16-3-7Z" /><path d="m11 13 9-9" /></Svg>
);
export const IconEdit = (p: IconProps) => (
  <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16Z" /><path d="m13.5 6.5 4 4" /></Svg>
);
export const IconUpload = (p: IconProps) => (
  <Svg {...p}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconX = (p: IconProps) => (
  <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
);
export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}><path d="m15 6-6 6 6 6" /></Svg>
);
export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}><path d="M19 12H5M11 18l-6-6 6-6" /></Svg>
);
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>
);
export const IconList = (p: IconProps) => (
  <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>
);
export const IconGrid = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Svg>
);
export const IconLock = (p: IconProps) => (
  <Svg {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>
);
export const IconDatabase = (p: IconProps) => (
  <Svg {...p}><ellipse cx="12" cy="5.5" rx="8" ry="3" /><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 2 20h20Z" /><path d="M12 10v4M12 17h.01" /></Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}><path d="m5 12 5 5L20 7" /></Svg>
);
export const IconInfo = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>
);
export const IconLogout = (p: IconProps) => (
  <Svg {...p}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></Svg>
);
export const IconMenu = (p: IconProps) => (
  <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" /></Svg>
);
export const IconEye = (p: IconProps) => (
  <Svg {...p}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Svg>
);
export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}><path d="M3 3l18 18" /><path d="M10.6 6.1A10 10 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.6 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Svg>
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p}><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" /><path d="M20 20v-4h-4" /></Svg>
);

const kindColor: Record<FileKind, string> = {
  pdf: 'var(--file-pdf)',
  image: 'var(--file-image)',
  text: 'var(--file-text)',
  word: 'var(--file-word)',
  sheet: 'var(--file-sheet)',
  slide: 'var(--file-slide)',
  archive: 'var(--file-archive)',
  other: 'var(--file-other)',
};

const kindLabel: Record<FileKind, string> = {
  pdf: 'PDF',
  image: 'IMG',
  text: 'TXT',
  word: 'DOC',
  sheet: 'XLS',
  slide: 'PPT',
  archive: 'ZIP',
  other: 'FILE',
};

export function FileIcon({ kind, size = 32 }: { kind: FileKind; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M7 2h12l8 8v18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="var(--surface)" stroke="var(--border-strong)" />
      <path d="M19 2v6a2 2 0 0 0 2 2h6" fill="none" stroke="var(--border-strong)" />
      <rect x="3" y="17" width="20" height="9" rx="2" fill={kindColor[kind]} />
      <text x="13" y="24" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff" fontFamily="inherit">
        {kindLabel[kind]}
      </text>
    </svg>
  );
}

export function fileKindLabel(kind: FileKind): string {
  return kindLabel[kind];
}
