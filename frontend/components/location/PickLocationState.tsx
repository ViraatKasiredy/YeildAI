'use client';

import { useState } from 'react';
import { MapPin, PlusCircle } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { AddFarmModal } from '@/components/layout/AddFarmModal';
import { useAuth } from '@/lib/auth/AuthContext';

/**
 * Empty state shown on Recommendations / Mandi Prices when the effective
 * location resolves to 'none' — i.e. the user has no farm and hasn't chosen a
 * location. The app never invents one, so instead of fetching with a blank
 * state/district we ask the user to pick a location (via the LocationBar's
 * "Change location" picker rendered just above this) or add a farm.
 *
 * Self-contained: it owns its own AddFarmModal rather than relying on the
 * app-wide 'open-add-farm' event, so it works regardless of which page hosts
 * it.
 */
export function PickLocationState({ kind }: { kind: 'prices' | 'recommendations' }) {
  const { isGuest } = useAuth();
  const [showAdd, setShowAdd] = useState(false);

  const heading =
    kind === 'prices' ? 'Pick a location to see mandi prices' : 'Pick a location to see crop recommendations';
  const body =
    kind === 'prices'
      ? 'We don’t assume a location for you. Choose a state and district with “Change location” above — or add a farm to anchor prices to it.'
      : 'We don’t assume a location for you. Choose a state and district with “Change location” above — or add a farm to anchor recommendations to it.';

  return (
    <>
      <Card title="Choose a location">
        <div className="py-12 text-center">
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'var(--sage-100)' }}
          >
            <MapPin className="h-8 w-8" style={{ color: 'var(--forest-600)' }} />
          </div>

          <h2 className="font-[var(--font-display)] text-[20px]" style={{ color: 'var(--forest-900)' }}>
            {heading}
          </h2>

          <p className="mx-auto mt-3 max-w-md text-sm leading-6" style={{ color: 'var(--ink-soft)' }}>
            {body}
          </p>

          {!isGuest && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--forest-700)' }}
            >
              <PlusCircle className="h-4 w-4" /> Add a farm
            </button>
          )}
        </div>
      </Card>

      {showAdd && <AddFarmModal onClose={() => setShowAdd(false)} />}
    </>
  );
}
