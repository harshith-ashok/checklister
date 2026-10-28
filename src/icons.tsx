import type { ReactNode, SVGProps } from 'react'

const Svg = ({ children, ...p }: SVGProps<SVGSVGElement> & { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width="1em" height="1em" aria-hidden="true" {...p}>
    {children}
  </svg>
)
type P = SVGProps<SVGSVGElement>

export const Logo = (p: P) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m8 12 3 3 5-6" /></Svg>
export const Sun = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
export const Moon = (p: P) => <Svg {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>
export const Upload = (p: P) => <Svg {...p}><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Svg>
export const Download = (p: P) => <Svg {...p}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></Svg>
export const Sync = (p: P) => <Svg {...p}><path d="M7 4v13M3 13l4 4 4-4M17 20V7M13 11l4-4 4 4" /></Svg>
export const Redo = (p: P) => <Svg {...p}><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" /></Svg>
export const X = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>
export const Plus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
export const Check = (p: P) => <Svg {...p}><path d="m5 12 5 5 9-10" /></Svg>
export const Left = (p: P) => <Svg {...p}><path d="m15 5-7 7 7 7" /></Svg>
export const Right = (p: P) => <Svg {...p}><path d="m9 5 7 7-7 7" /></Svg>
export const Down = (p: P) => <Svg {...p}><path d="m5 9 7 7 7-7" /></Svg>
export const Up = (p: P) => <Svg {...p}><path d="m5 15 7-7 7 7" /></Svg>
export const Info = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></Svg>
export const Image = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m21 16-5-5-8 8" /></Svg>
export const Grid = (p: P) => <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Svg>
export const List = (p: P) => <Svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Svg>
export const Layers = (p: P) => <Svg {...p}><path d="m12 3 9 5-9 5-9-5zM3 13l9 5 9-5" /></Svg>
export const Merge = (p: P) => <Svg {...p}><path d="M6 3v6a6 6 0 0 0 6 6h0M18 3v6a6 6 0 0 1-6 6M12 15v6M9 18l3 3 3-3" /></Svg>
