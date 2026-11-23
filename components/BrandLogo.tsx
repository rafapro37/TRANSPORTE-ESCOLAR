'use client';

import React, { useState } from 'react';
import { Bus } from 'lucide-react';

interface BrandLogoProps {
  logoFileId: string | null;
  previewUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function BrandLogo({
  logoFileId,
  previewUrl,
  size = 'md',
  className = '',
}: BrandLogoProps) {
  const [failed, setFailed] = useState(false);

  const src =
    previewUrl ||
    (logoFileId
      ? `/api/files/${encodeURIComponent(logoFileId)}`
      : '/images/elefante-rosa-logo.jpg');

  const sizeClasses =
    size === 'sm'
      ? 'w-9 h-9 rounded-lg'
      : size === 'lg'
        ? 'w-20 h-20 rounded-2xl'
        : 'w-11 h-11 rounded-xl';

  if (failed) {
    return (
      <div
        className={`${sizeClasses} flex items-center justify-center bg-rose-50 text-rose-600 border border-rose-200 shrink-0 ${className}`}
        aria-label="ELEFANTE ROSA"
      >
        <Bus className={size === 'lg' ? 'w-9 h-9' : 'w-5 h-5'} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt="Logo ELEFANTE ROSA – 3 CARROS ESCOLARES"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClasses} object-cover bg-white border border-slate-200 shrink-0 ${className}`}
    />
  );
}
