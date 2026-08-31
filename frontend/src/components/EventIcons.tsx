import type { SVGProps } from "react";

type EventIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
  strokeWidth?: number;
};

function base(size: number, strokeWidth: number): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 32 32",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    xmlns: "http://www.w3.org/2000/svg",
  };
}

export function ShotIcon({ size = 28, strokeWidth = 1.8, ...rest }: EventIconProps) {
  return (
    <svg {...base(size, strokeWidth)} aria-hidden="true" {...rest}>
      <path d="M2 20 L5.5 20" opacity="0.45" />
      <path d="M1.5 25 L4.5 25" opacity="0.45" />
      <circle cx="9.5" cy="22.5" r="4.2" />
      <path d="M9.5 20.6 L11.31 21.91 L10.62 24.04 L8.38 24.04 L7.69 21.91 Z" strokeWidth="1" opacity="0.65" />
      <path d="M13.5 19.5 C19 17.5, 23.5 13, 26 7.5" />
      <path d="M22.7 9.8 L26 7.5 L26.4 11.5" />
      <path d="M14 15.5 L15.5 13.8" opacity="0.5" />
      <path d="M10.6 15 L11.1 12.8" opacity="0.5" />
    </svg>
  );
}

export function ShotAgainstIcon({ size = 28, strokeWidth = 1.8, ...rest }: EventIconProps) {
  return (
    <svg {...base(size, strokeWidth)} aria-hidden="true" {...rest}>
      <path d="M3 28 L3 16 L29 16 L29 28" />
      <path d="M9.5 16 L9.5 28 M16 16 L16 28 M22.5 16 L22.5 28 M3 22 L29 22" strokeWidth="0.9" opacity="0.3" />
      <circle cx="23" cy="8" r="4" />
      <path d="M23 6.1 L24.81 7.41 L24.12 9.54 L21.88 9.54 L21.19 7.41 Z" strokeWidth="1" opacity="0.65" />
      <path d="M26.8 4.6 L29.3 2.1" opacity="0.45" />
      <path d="M28.5 9 L30.3 7.2" opacity="0.45" />
      <path d="M19.5 11 L14.5 15" />
      <path d="M17.96 14.47 L14.5 15 L15.77 11.74" />
    </svg>
  );
}

export function TackleIcon({ size = 28, strokeWidth = 1.8, ...rest }: EventIconProps) {
  return (
    <svg {...base(size, strokeWidth)} aria-hidden="true" {...rest}>
      <path d="M2 29 L17 29" strokeWidth="1" opacity="0.3" />
      <path d="M2.5 27 L10 22 L16 20.5" />
      <path d="M16 20.5 L18.5 18.6" />
      <circle cx="22.5" cy="12.5" r="4.3" />
      <path d="M22.5 10.5 L24.4 11.88 L23.67 14.12 L21.33 14.12 L20.6 11.88 Z" strokeWidth="1" opacity="0.65" />
      <path d="M18.6 17.6 L16.8 19.2" opacity="0.55" />
      <path d="M17.6 14.6 L15.3 14" opacity="0.55" />
      <path d="M21.6 18.4 L21.2 20.8" opacity="0.55" />
      <path d="M26.8 8.6 L28.8 6.6" opacity="0.45" />
    </svg>
  );
}

export function InterceptionIcon({ size = 28, strokeWidth = 1.8, ...rest }: EventIconProps) {
  return (
    <svg {...base(size, strokeWidth)} aria-hidden="true" {...rest}>
      <path d="M3 25 C9 19, 15 15, 27 13" strokeDasharray="2.6 2.8" opacity="0.4" />
      <circle cx="15.5" cy="15" r="4" />
      <path d="M15.5 13.1 L17.31 14.41 L16.62 16.54 L14.38 16.54 L13.69 14.41 Z" strokeWidth="1" opacity="0.65" />
      <path d="M18.9 11.4 L20.1 16.2" />
      <path d="M17.5 18.5 C20 22, 21.5 25, 22 28" />
      <path d="M23.3 24.8 L22 28 L19.84 25.25" />
    </svg>
  );
}
