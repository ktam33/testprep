'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearCurrentUser, getCurrentUser } from '@/utils/session';

export default function UserBar() {
  const [name, setName] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  // The layout persists across client-side navigations, so this component doesn't
  // remount when a profile is selected — re-read localStorage on every route change.
  useEffect(() => {
    setName(getCurrentUser()?.name ?? null);
  }, [pathname]);

  function switchProfile() {
    // The picker at "/" auto-redirects back to the dashboard whenever a profile is
    // already stored, so clear it first or "Switch profile" would just bounce back.
    clearCurrentUser();
    router.push('/');
  }

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="font-semibold text-gray-900">
          PreACT TestPrep
        </Link>
        {name && (
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span>
              Practicing as <strong className="text-gray-900">{name}</strong>
            </span>
            <button type="button" onClick={switchProfile} className="text-blue-600 hover:underline">
              Switch profile
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
