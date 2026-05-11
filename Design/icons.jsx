// icons.jsx — small Lucide-style stroke icon set
const Icon = ({ path, size = 18, stroke = 1.5, fill = 'none', style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
    {path}
  </svg>
);

const I = {
  Home: (p) => <Icon {...p} path={<><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></>} />,
  Plus: (p) => <Icon {...p} path={<><path d="M12 5v14M5 12h14"/></>} />,
  Library: (p) => <Icon {...p} path={<><rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="15" width="7" height="7" rx="1"/><rect x="14" y="15" width="7" height="7" rx="1"/></>} />,
  Progress: (p) => <Icon {...p} path={<><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></>} />,
  User: (p) => <Icon {...p} path={<><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></>} />,
  Camera: (p) => <Icon {...p} path={<><path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="4"/></>} />,
  Search: (p) => <Icon {...p} path={<><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></>} />,
  Flame: (p) => <Icon {...p} path={<path d="M12 3s4 4 4 8a4 4 0 1 1-8 0c0-2 2-3 2-5 0 2 2 3 2-3z"/>} />,
  Close: (p) => <Icon {...p} path={<><path d="M6 6l12 12M18 6l6 6"/></>} strokeWidth={1.5} />,
  X: (p) => <Icon {...p} path={<><path d="M6 6l12 12M18 6L6 18"/></>} />,
  Check: (p) => <Icon {...p} path={<path d="M5 12l4 4 10-10"/>} />,
  Trash: (p) => <Icon {...p} path={<><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></>} />,
  ChevronLeft: (p) => <Icon {...p} path={<path d="m15 6-6 6 6 6"/>} />,
  ChevronRight: (p) => <Icon {...p} path={<path d="m9 6 6 6-6 6"/>} />,
  ChevronDown: (p) => <Icon {...p} path={<path d="m6 9 6 6 6-6"/>} />,
  Clock: (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />,
  Sparkles: (p) => <Icon {...p} path={<><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2"/></>} />,
  Zap: (p) => <Icon {...p} path={<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>} />,
  Type: (p) => <Icon {...p} path={<><path d="M4 7V5h16v2"/><path d="M9 19h6"/><path d="M12 5v14"/></>} />,
  Image: (p) => <Icon {...p} path={<><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 9"/></>} />,
  Bookmark: (p) => <Icon {...p} path={<path d="M6 3h12v18l-6-4-6 4z"/>} />,
  Drop: (p) => <Icon {...p} path={<path d="M12 3s6 6 6 11a6 6 0 1 1-12 0c0-5 6-11 6-11z"/>} />,
  Info: (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></>} />,
  Settings: (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2L5 6 3 9.3l2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c0-.4.1-.8.1-1.2z"/></>} />,
  Command: (p) => <Icon {...p} path={<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6z"/>} />,
  Keyboard: (p) => <Icon {...p} path={<><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h12"/></>} />,
  Bolt: (p) => <Icon {...p} path={<path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z"/>} />,
  Target: (p) => <Icon {...p} path={<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></>} />,
  Dot: (p) => <Icon {...p} path={<circle cx="12" cy="12" r="3" fill="currentColor"/>} />,
  Star: (p) => <Icon {...p} path={<path d="m12 3 2.5 5.5L20 9.5l-4 4 1 5.5L12 16l-5 3 1-5.5-4-4 5.5-1z"/>} />,
  ArrowRight: (p) => <Icon {...p} path={<><path d="M5 12h14M13 6l6 6-6 6"/></>} />,
  ArrowUp: (p) => <Icon {...p} path={<><path d="M12 19V5M6 11l6-6 6 6"/></>} />,
  ArrowDown: (p) => <Icon {...p} path={<><path d="M12 5v14M6 13l6 6 6-6"/></>} />,
  MoreH: (p) => <Icon {...p} path={<><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>} />,
  Edit: (p) => <Icon {...p} path={<><path d="M4 20h4l10-10-4-4L4 16z"/><path d="m14 6 4 4"/></>} />,
  Calendar: (p) => <Icon {...p} path={<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>} />,
  Menu: (p) => <Icon {...p} path={<><path d="M4 6h16M4 12h16M4 18h16"/></>} />,
  Upload: (p) => <Icon {...p} path={<><path d="M12 3v12M6 9l6-6 6 6"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></>} />,
  Apple: (p) => <Icon {...p} path={<><path d="M12 7c-3 0-7 3-7 8 0 4 3 6 5 6 1 0 2-1 2-1s1 1 2 1c2 0 5-2 5-6 0-5-4-8-7-8z"/><path d="M12 7s.5-3 3-4M12 7V4"/></>} />,
};

window.I = I;
