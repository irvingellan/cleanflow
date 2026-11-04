// Inline icons (no icon font, no network). Always paired with visible text.
type IconName =
  | "bell" | "play" | "pause" | "step" | "replay" | "reset" | "next" | "download" | "copy" | "link"
  | "expand" | "wifi" | "wifiOff" | "lock" | "check" | "x" | "alert" | "phone" | "list" | "trail" | "doc"
  | "calendar" | "save" | "trash" | "eye" | "user";

const PATHS: Record<IconName, string> = {
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  play: "M7 4l13 8-13 8z",
  pause: "M7 4h3v16H7zM14 4h3v16h-3z",
  step: "M5 4l10 8-10 8zM17 4h2v16h-2z",
  replay: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5",
  reset: "M4 4v6h6M20 20v-6h-6M5.5 15a7 7 0 0 0 12.4 2M18.5 9A7 7 0 0 0 6.1 7",
  next: "M5 12h14M13 6l6 6-6 6",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
  wifi: "M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0M12 20h.01",
  wifiOff: "M2 2l20 20M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4.2-2.4M12 20h.01M16.7 11.1a10 10 0 0 1 2.3 1.4",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  check: "M4 12l5 5L20 6",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 3l10 18H2zM12 10v4M12 18h.01",
  phone: "M7 2h10v20H7zM11 18h2",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  trail: "M4 4v16M4 8h8M4 14h12M4 20h6",
  doc: "M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h8",
  calendar: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  save: "M5 3h11l3 3v15H5zM8 3v5h8M8 14h8v7H8z",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const filled = name === "play" || name === "pause" || name === "step";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
