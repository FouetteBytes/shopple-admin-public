import Image from 'next/image';
import { resolveAvatarPresentation, type AvatarProfileLike } from '@/utils/avatar';
import type { ProductRequestSubmittedBy, ProductRequestUserProfile } from '@/lib/productRequestApi';
import type { CSSProperties } from 'react';

export type RequesterInfo = {
  name: string;
  email?: string;
  imageUrl?: string;
  resolvedPhotoUrl?: string;
  initials?: string;
  memojiId?: string;
  memojiUrl?: string;
  profile?: ProductRequestUserProfile | null;
};

function coerceString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function computeInitials(value?: string | null) {
  if (!value) return undefined;
  const tokens = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((token) => token.charAt(0).toUpperCase());
  if (tokens.length === 0) {
    return value.slice(0, 2).toUpperCase();
  }
  return tokens.join('');
}

export function extractRequesterInfo(submittedBy?: ProductRequestSubmittedBy | null): RequesterInfo | null {
  if (!submittedBy) {
    console.log('[RequesterAvatar] No submittedBy data provided');
    return null;
  }

  console.log('[RequesterAvatar] Raw submittedBy data:', JSON.stringify(submittedBy, null, 2));

  const profile = submittedBy.profile;
  const avatar = profile?.avatar;
  
  console.log('[RequesterAvatar] Extracted profile:', profile);
  console.log('[RequesterAvatar] Extracted avatar:', avatar);
  
  const possibleName =
    coerceString(profile?.fullName) ||
    coerceString(profile?.displayName) ||
    coerceString((submittedBy as Record<string, unknown>)['fullName']) ||
    coerceString((submittedBy as Record<string, unknown>)['displayName']) ||
    coerceString((submittedBy as Record<string, unknown>)['name']) ||
    coerceString((submittedBy as Record<string, unknown>)['email']);

  const email =
    coerceString(profile?.email) ||
    coerceString((submittedBy as Record<string, unknown>)['email']);

  const initials =
    profile?.initials ||
    (possibleName || email ? computeInitials(possibleName ?? email ?? '') : undefined);
  const resolvedPhotoUrl = profile?.resolvedPhotoUrl ?? avatar?.resolvedUrl ?? undefined;
  const effectivePhotoUrl = profile?.effectivePhotoUrl ?? avatar?.effectiveUrl ?? undefined;
  
  console.log('[RequesterAvatar] Computed values:', {
    possibleName,
    email,
    initials,
    resolvedPhotoUrl,
    effectivePhotoUrl,
  });

  let imageUrl: string | undefined = resolvedPhotoUrl ?? undefined;
  let memojiId: string | undefined = avatar?.memojiId ?? undefined;

  if (!memojiId && typeof effectivePhotoUrl === 'string' && effectivePhotoUrl.startsWith('memoji://')) {
    memojiId = effectivePhotoUrl.replace('memoji://', '');
  }

  let memojiUrl = avatar?.memojiUrl ?? undefined;
  if (!memojiUrl && memojiId) {
    const cleanMemojiId = memojiId.endsWith('.png') ? memojiId : `${memojiId}.png`;
    memojiUrl = `/api/admin/avatar/memoji/${cleanMemojiId}`;
  }

  if (!imageUrl && memojiUrl) {
    imageUrl = memojiUrl;
  }

  if (!imageUrl && effectivePhotoUrl && !effectivePhotoUrl.startsWith('memoji://')) {
    imageUrl = effectivePhotoUrl;
  }

  if (!imageUrl && typeof submittedBy['photoURL'] === 'string') {
    imageUrl = submittedBy['photoURL'] as string;
  }

  const result = {
    name: possibleName || email || 'Unknown user',
    email,
    imageUrl,
    resolvedPhotoUrl,
    initials,
    memojiId,
    memojiUrl,
    profile,
  };

  console.log('[RequesterAvatar] Final result:', result);
  
  return result;
}

export function RequesterAvatar({ info, size = 'sm' }: { info: RequesterInfo; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const dimension = size === 'xs' ? 24 : size === 'sm' ? 32 : size === 'md' ? 40 : 48;
  const profileLike: AvatarProfileLike = info.profile
    ? {
        ...info.profile,
        avatar:
          info.profile.avatar ??
          (info.memojiId
            ? { type: 'memoji', memojiId: info.memojiId, memojiUrl: info.memojiUrl, background: info.profile.profileBackground ?? null }
            : undefined),
        resolvedPhotoUrl: info.profile.resolvedPhotoUrl ?? info.resolvedPhotoUrl ?? info.imageUrl,
        effectivePhotoUrl: info.profile.effectivePhotoUrl ?? info.imageUrl,
        initials: info.profile.initials ?? info.initials,
        fullName: info.profile.fullName ?? info.name,
        displayName: info.profile.displayName ?? info.name,
        email: info.profile.email ?? info.email,
      }
    : {
        resolvedPhotoUrl: info.resolvedPhotoUrl ?? info.imageUrl,
        effectivePhotoUrl: info.imageUrl,
        initials: info.initials,
        fullName: info.name,
        email: info.email,
        avatar: info.memojiId
          ? {
              type: 'memoji',
              memojiId: info.memojiId,
              memojiUrl: info.memojiUrl ?? `/api/admin/avatar/memoji/${info.memojiId}`,
              background: null,
            }
          : undefined,
      };

  const { imageUrl, fit, backgroundStyle, showBackground, initials } = resolveAvatarPresentation(profileLike);
  const containerStyle: CSSProperties = { width: dimension, height: dimension };
  const containerClasses = [
    'relative rounded-full overflow-hidden flex items-center justify-center font-semibold',
    showBackground ? 'text-white' : 'bg-primary/5 text-primary',
  ].join(' ');

  return (
    <div className={containerClasses} style={containerStyle} aria-label={info.name}>
      {showBackground ? <div className="absolute inset-0" style={backgroundStyle} aria-hidden /> : null}
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={info.name}
          className={`relative z-10 w-full h-full ${fit === 'contain' ? 'object-contain p-1' : 'object-cover'}`}
          width={dimension}
          height={dimension}
          referrerPolicy="no-referrer"
          unoptimized
        />
      ) : (
        <span className="relative z-10 text-xs">{initials || info.initials || '??'}</span>
      )}
    </div>
  );
}
