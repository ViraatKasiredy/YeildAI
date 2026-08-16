'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import { useAuth } from '@/lib/auth/AuthContext';
import { AddFarmModal } from './AddFarmModal';

/**
 * App-wide floating "Add farm" button, bottom-right.
 *
 * - Farmers: opens the real AddFarmModal.
 * - Admins: hidden (they manage regions, not personal farms).
 * - Guests: opens the add-farm flow too — task 5 swaps the guest branch for
 *   the session-only sample-farm picker.
 *
 * It also listens for the app-wide `open-add-farm` event, so the existing
 * "Add a farm" prompts scattered across the dashboard/weather/soil/etc. pages
 * (which dispatch that event) now actually open the modal from one place.
 */
export function FloatingAddFarmButton() {
  const { isAdmin, isFarmer, isGuest } = useAuth();
  const [showAdd, setShowAdd] = useState(false);

  // Only farmers and guests can add a farm; admins never see the button.
  const canAdd = isFarmer || isGuest;

  useEffect(() => {
    if (!canAdd) return;
    const handleOpen = () => setShowAdd(true);
    window.addEventListener('open-add-farm', handleOpen);
    return () => window.removeEventListener('open-add-farm', handleOpen);
  }, [canAdd]);

  if (!canAdd) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowAdd(true)}
        aria-label="Add farm"
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-white transition-transform hover:scale-105"
        style={{ background: 'var(--forest-700)', boxShadow: '0 10px 30px -8px rgba(20,49,42,0.45)' }}
      >
        <Plus className="h-5 w-5" />
        <span className="hidden sm:inline">Add farm</span>
      </button>

      {/* task 5: for guests, swap this for the sample-farm flow */}
      {showAdd && <AddFarmModal onClose={() => setShowAdd(false)} />}
    </>
  );
}
