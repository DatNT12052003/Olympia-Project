import type { SVGProps } from 'react';

/** Icon nét (stroke) dùng `currentColor`; mặc định chỉ để trang trí (`aria-hidden`). */
function Icon({ children, size = 18, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

export const AlertCircleIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </Icon>
);

export const MailIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon strokeWidth={2.5} {...props}>
    <path d="M5 12l5 5L20 7" />
  </Icon>
);

export const CheckCircleIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12l3 3 5-6" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon strokeWidth={2.2} {...props}>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon strokeWidth={2.5} {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const MoreIcon = (props: IconProps) => (
  <Icon fill="currentColor" stroke="none" {...props}>
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </Icon>
);

export const MonitorIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M8 21h8" />
  </Icon>
);

export const LeaveIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
  </Icon>
);

export const PlayIcon = (props: IconProps) => (
  <Icon fill="currentColor" stroke="none" {...props}>
    <path d="M7 4l13 8-13 8z" />
  </Icon>
);

export const WifiOffIcon = (props: IconProps) => (
  <Icon strokeWidth={1.8} {...props}>
    <path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01" />
    <path d="M3 3l18 18" />
  </Icon>
);
