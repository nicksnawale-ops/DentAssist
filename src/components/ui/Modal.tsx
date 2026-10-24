import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Modal({
  title, onClose, children, footer, size = 'md', subtitle,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const width = size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl';
  return (
    <Dialog.Root open onOpenChange={o => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-ink/40 z-50 print:hidden" />
        <Dialog.Content className={`fixed z-50 inset-x-0 bottom-0 top-6 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full ${width} sm:max-h-[92vh] bg-surface rounded-t-[20px] sm:rounded-panel shadow-float flex flex-col print:static print:translate-x-0 print:translate-y-0 print:max-h-none print:shadow-none`}>
          <div className="flex items-start gap-3 px-5 py-3 min-h-14 border-b border-line flex-none print:hidden">
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-[17px] font-semibold leading-tight">{title}</Dialog.Title>
              {subtitle && <Dialog.Description className="text-[13px] text-text-muted">{subtitle}</Dialog.Description>}
            </div>
            <Dialog.Close className="p-2 -mr-2 rounded-control text-text-muted hover:bg-surface-hover" aria-label="Close"><X className="w-5 h-5" /></Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="px-5 py-3 border-t border-line flex flex-wrap justify-end gap-2 flex-none print:hidden">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block text-[12px] text-text-muted mt-0.5">{hint}</span>}
    </label>
  );
}

export const selectClass = 'w-full h-10 px-3 rounded-control border border-line bg-surface text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none';
export const textareaClass = 'w-full p-3 rounded-control border border-line bg-surface text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary focus:outline-none';
