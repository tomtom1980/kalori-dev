'use client';

/**
 * <LogFlowModalMount /> — Chrome-level lazy mount of the log flow modal.
 *
 * Dynamic-imported with `ssr: false` so the modal's ~63 KB bundle
 * (Radix Dialog + Radix Tabs + browser-image-compression) never hits
 * dashboard first paint. Subscribes to `useLogFlowStore.isOpen` and
 * renders `null` until the user triggers the modal from any of:
 *   - <LogFAB /> click (mobile)
 *   - `n` keyboard shortcut (<LogFlowKeybinding />)
 *   - direct navigation to `/log`
 */
import dynamic from 'next/dynamic';

import { selectIsOpen, useLogFlowStore } from '@/lib/stores/useLogFlowStore';

const LogFlowModal = dynamic(
  () => import('@/app/(app)/log/_components/LogFlowModal').then((m) => m.LogFlowModal),
  { ssr: false, loading: () => null },
);

export function LogFlowModalMount() {
  const isOpen = useLogFlowStore(selectIsOpen);
  if (!isOpen) return null;
  return <LogFlowModal />;
}

export default LogFlowModalMount;
