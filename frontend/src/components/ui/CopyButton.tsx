import { useEffect, useState } from 'react';
import { Button, type ButtonProps } from './Button';

export interface CopyButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  value: string;
  label?: string;
  copiedLabel?: string;
  onCopied?: () => void;
}

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.className = 'fixed -left-[9999px] top-0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** Copies a value to the clipboard and confirms inline ("Copied") with a live region. */
export function CopyButton({
  value,
  label = 'Copy link',
  copiedLabel = 'Copied',
  onCopied,
  variant = 'outline',
  size = 'sm',
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      variant={variant}
      size={size}
      onClick={async () => {
        if (await copyText(value)) {
          setCopied(true);
          onCopied?.();
        }
      }}
      leftIcon={
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          {copied ? (
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 011.4-1.4L8 12.58l7.3-7.3a1 1 0 011.4 0z"
            />
          ) : (
            <path d="M7 3.5A1.5 1.5 0 018.5 2h6A1.5 1.5 0 0116 3.5v9a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 017 12.5v-9zM4 6.5A1.5 1.5 0 015.5 5H6v7.5A2.5 2.5 0 008.5 15H13v.5a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 014 15.5v-9z" />
          )}
        </svg>
      }
      {...props}
    >
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  );
}
