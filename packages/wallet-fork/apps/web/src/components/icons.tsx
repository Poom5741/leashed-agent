/** Shared SVG line-icon set (lucide-style paths, stroke = currentColor).
 *  Replaces every emoji/dingbat in the judge-facing UI. */

const PATHS: Record<string, string> = {
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 12l9-9"/><path d="M17 6l3 3"/><path d="M14 9l2 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  chevLeft: '<path d="M15 18l-6-6 6-6"/>',
  chevRight: '<path d="M9 18l6-6-6-6"/>',
  arrowIn: '<path d="M17 7L7 17"/><path d="M17 17H7V7"/>',
  arrowOut: '<path d="M7 17L17 7"/><path d="M7 7h10v10"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  cloud: '<path d="M17.5 19a4.5 4.5 0 1 0-.44-8.98 6 6 0 0 0-11.4 1.83A4 4 0 0 0 7 19z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  fuel: '<path d="M3 22h12V2H5a2 2 0 0 0-2 2v18z"/><path d="M14 6h2a2 2 0 0 1 2 2v9a1.5 1.5 0 0 0 3 0V9l-3-3"/><path d="M7 6h4v4H7z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
};

export function Ico({
  name,
  size = 15,
  strokeWidth = 1.8,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ flexShrink: 0, verticalAlign: "-0.15em", display: "inline-block" }}
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? "" }}
    />
  );
}
