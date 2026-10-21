// Stroke icon set for the prototype. Same drawing rules as the V2 primitives
// Icon (24 grid, 1.8 stroke, currentColor); adds the glyphs V2 does not have yet.
const paths = {
  home: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7",
  list: "M8 3h8v4H8zM5 5h14v16H5zm4 6h6m-6 4h6",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 8 3 9H3c0-1 3-2 3-9M10 21a2 2 0 0 0 4 0",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  userX: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 8l5 5M22 8l-5 5",
  userCheck: "M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M16 11l2 2 4-4",
  check: "m5 12.5 4.5 4.5L19 7.5",
  checkCircle: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M8 12.5l2.8 2.8L16 9.5",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M10.3 3.9 2.5 17.5A2 2 0 0 0 4.2 20.5h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4.5M12 17h.01",
  alertCircle: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 7.5v5M12 16.5h.01",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 11v5.5M12 7.5h.01",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 7v5l3 2",
  calendar: "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4",
  chevronL: "M15 6l-6 6 6 6", chevronR: "M9 6l6 6-6 6", chevronD: "M6 9l6 6 6-6", chevronU: "M6 15l6-6 6 6",
  arrowR: "M5 12h14M13 6l6 6-6 6", arrowL: "M19 12H5M11 6l-6 6 6 6",
  send: "M21 3 10 14M21 3l-7 18-4-7-7-4z",
  link: "M10 13.5a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10.5a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2",
  msg: "M21 12a8 8 0 0 1-11.8 7L4 20l1.2-4.7A8 8 0 1 1 21 12z",
  refresh: "M20 11A8 8 0 0 0 5.3 7M4 4v4h4M4 13a8 8 0 0 0 14.7 4M20 20v-4h-4",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  plus: "M12 5v14M5 12h14",
  camera: "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  image: "M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM3 16l5-5 4 4 3-3 6 6M15.5 8.5h.01",
  lock: "M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4",
  unlock: "M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 7.5-2",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  key: "M15 7a4 4 0 1 1-3.7 5.5L4 20v-3h2v-2h2l2.3-2.3A4 4 0 0 1 15 7zM16 8h.01",
  building: "M4 21V8l8-5 8 5v13M9 21v-6h6v6M2 21h20",
  clipboard: "M9 4h6v3H9zM15 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2",
  clipCheck: "M9 4h6v3H9zM15 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2M9 14l2 2 4-4",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z",
  globe: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20",
  flask: "M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7.5 14h9",
  spark: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16v4M17 18h4",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  dollar: "M12 2v20M17 6H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
  up: "M12 19V5M6 11l6-6 6 6", down: "M12 5v14M6 13l6 6 6-6",
  phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
  layout: "M4 4h16v16H4zM4 9h16M10 9v11",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3.5 2",
  pin: "M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5",
  minus: "M7 12h10",
};

export function Icon({ name, size = 18, className = "", label }) {
  return (
    <svg className={`mw-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden={label ? undefined : "true"} role={label ? "img" : undefined} aria-label={label} focusable="false">
      <path d={paths[name] || paths.info} />
    </svg>
  );
}
