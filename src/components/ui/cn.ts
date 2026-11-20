// Class names joined, falsy parts dropped. The shadcn/ui `cn` without
// tailwind-merge: components here never pass conflicting utilities.
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
