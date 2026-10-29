import { useId } from 'react';

// Original OmniMind mark: an eye whose iris doubles as a memory "dot".
export default function Logo({ size = 28 }) {
  const gradientId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3D8BFF" />
          <stop offset="1" stopColor="#0866FF" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path
        d="M5 16c2.8-4.6 6.6-7 11-7s8.2 2.4 11 7c-2.8 4.6-6.6 7-11 7s-8.2-2.4-11-7z"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="4.2" fill="#fff" />
      <circle cx="16" cy="16" r="1.6" fill="#0866FF" />
    </svg>
  );
}
