"use client";

export function LockedBanner({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-500 shrink-0">
        <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
      </svg>
      <p className="text-xs text-amber-800 flex-1">
        This builder is <span className="font-semibold">locked</span> — viewing only. No changes can be made.
      </p>
      <button
        onClick={onUnlock}
        className="text-xs font-medium text-amber-700 hover:text-amber-900 hover:underline shrink-0"
      >
        Unlock
      </button>
    </div>
  );
}
