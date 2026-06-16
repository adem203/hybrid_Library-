// ============================================================
// loansIcons.js — inline SVG icons for the Admin Loans page.
// No emoji; stroke="currentColor" so colour comes from CSS.
// ============================================================

import React from 'react';

const Svg = ({ size = 18, className, children }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconLoanMark = (p) => (
  <Svg {...p}>
    <path d="M3 6.5C3 5.7 3.7 5 4.5 5H9a3 3 0 0 1 3 3v11a2.5 2.5 0 0 0-2.5-2.5H3z" />
    <path d="M21 6.5c0-.8-.7-1.5-1.5-1.5H15a3 3 0 0 0-3 3v11a2.5 2.5 0 0 1 2.5-2.5H21z" />
    <path d="m16.5 7 2 2-2 2" />
    <path d="M7.5 11 5.5 9l2-2" />
  </Svg>
);

export const IconBook = (p) => (
  <Svg {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </Svg>
);

export const IconCheckCircle = (p) => (
  <Svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></Svg>
);

export const IconClock = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Svg>
);

export const IconLayers = (p) => (
  <Svg {...p}>
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </Svg>
);

export const IconFileText = (p) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
  </Svg>
);

export const IconExport = (p) => (
  <Svg {...p}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </Svg>
);

export const IconPlus = (p) => (<Svg {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>);
export const IconSearch = (p) => (<Svg {...p}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>);
export const IconReset = (p) => (<Svg {...p}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></Svg>);
export const IconCheck = (p) => (<Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>);
export const IconKebab = (p) => (<Svg {...p}><circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" /></Svg>);
export const IconChevronLeft = (p) => (<Svg {...p}><polyline points="15 18 9 12 15 6" /></Svg>);
export const IconChevronRight = (p) => (<Svg {...p}><polyline points="9 18 15 12 9 6" /></Svg>);
export const IconReturn = (p) => (<Svg {...p}><polyline points="9 10 4 15 9 20" /><path d="M20 4v7a4 4 0 0 1-4 4H4" /></Svg>);
export const IconExtend = (p) => (<Svg {...p}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /><path d="M12 3a9 9 0 0 1 0 18" /></Svg>);
export const IconX = (p) => (<Svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>);
