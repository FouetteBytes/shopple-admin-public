import type { CSSProperties } from 'react';
import type { AvatarBackground, AvatarData } from '@/lib/avatarTypes';

const DEFAULT_COLORS = ['#6366F1', '#8B5CF6'];

export interface AvatarProfileLike {
  avatar?: AvatarData | null;
  profileBackground?: AvatarBackground | null;
  resolvedPhotoUrl?: string | null;
  effectivePhotoUrl?: string | null;
  photoURL?: string | null;
  customPhotoURL?: string | null;
  defaultImageId?: string | null;
  profileImageType?: string | null;
  initials?: string | null;
  fullName?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  uid?: string | null;
}

export interface AvatarPresentation {
  imageUrl?: string;
  fit: 'cover' | 'contain';
  backgroundStyle: CSSProperties;
  showBackground: boolean;
  initials: string;
}

type NullableString = string | null | undefined;

function normaliseColor(color: NullableString): string | undefined {
  if (!color) return undefined;
  const trimmed = color.trim();
  if (!trimmed) return undefined;
  const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `#${hex.toUpperCase()}`;
  }
  return undefined;
}

function lightenColor(hex: string, factor = 0.2): string {
  const normalised = normaliseColor(hex);
  if (!normalised) return '#FFFFFF';
  const value = normalised.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);

  const adjust = (channel: number) => {
    const result = Math.round(channel + (255 - channel) * factor);
    return Math.min(255, Math.max(0, result));
  };

  const toHex = (channel: number) => channel.toString(16).padStart(2, '0').toUpperCase();

  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`;
}

function sanitiseMemojiPath(path?: NullableString): string | undefined {
  if (!path) return undefined;
  const unified = path.replace(/\\/g, '/').trim();
  if (!unified) return undefined;
  const segments = unified
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  if (segments.length === 0) {
    return undefined;
  }
  const last = segments[segments.length - 1];
  if (!last.includes('.')) {
    segments[segments.length - 1] = `${last}.png`;
  }
  return segments.join('/');
}

function buildMemojiUrl(candidate: string, defaultImageId?: NullableString): string | undefined {
  const stripped = candidate.replace('memoji://', '') || (typeof defaultImageId === 'string' ? defaultImageId : undefined);
  const safePath = sanitiseMemojiPath(stripped);
  if (!safePath) return undefined;
  return `/api/admin/avatar/memoji/${safePath}`;
}

function buildBackgroundStyle(background?: AvatarBackground | null): CSSProperties {
  const colors = (background?.colors ?? [])
    .map((color) => normaliseColor(color))
    .filter((color): color is string => Boolean(color));

  const resolvedColors = colors.length > 0 ? colors : DEFAULT_COLORS;
  const type = background?.type ?? (resolvedColors.length > 1 ? 'gradient' : 'solid');

  if (type === 'solid') {
    return { backgroundColor: resolvedColors[0] ?? DEFAULT_COLORS[0] };
  }

  if (type === 'pattern') {
    const primary = resolvedColors[0] ?? DEFAULT_COLORS[0];
    const secondary = resolvedColors[1] ?? lightenColor(primary, 0.25);
    return {
      backgroundColor: primary,
      backgroundImage: `repeating-linear-gradient(135deg, ${primary} 0px, ${primary} 12px, ${secondary} 12px, ${secondary} 24px)`,
    };
  }

  const gradientStops = resolvedColors.length > 1 ? resolvedColors : [resolvedColors[0], lightenColor(resolvedColors[0]!, 0.2)];
  return {
    backgroundImage: `linear-gradient(135deg, ${gradientStops.join(', ')})`,
  };
}

function computeInitials(profile?: AvatarProfileLike | null): string {
  if (!profile) return '??';
  const fromProfile = profile.avatar?.fallbackInitials ?? profile.initials;
  if (fromProfile && fromProfile.trim()) {
    return fromProfile.trim().slice(0, 2).toUpperCase();
  }

  const parts: string[] = [];
  if (profile.firstName) parts.push(profile.firstName);
  if (profile.lastName) parts.push(profile.lastName);
  if (parts.length === 0) {
    const display = profile.fullName || profile.displayName || profile.email || profile.uid;
    if (display) {
      parts.push(...display.split(/\s+/));
    }
  }

  const letters = parts
    .filter(Boolean)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join('');

  return letters || '??';
}

function coerceImageUrl(profile?: AvatarProfileLike | null): { url?: string; typeHint?: string } {
  if (!profile) return {};
  const avatar = profile.avatar;

  const candidates: Array<{ url?: string | null; typeHint?: string }> = [
    { url: avatar?.resolvedUrl, typeHint: avatar?.type ?? profile.profileImageType ?? undefined },
    { url: profile.resolvedPhotoUrl, typeHint: avatar?.type ?? profile.profileImageType ?? undefined },
    { url: avatar?.memojiUrl, typeHint: 'memoji' },
    { url: avatar?.effectiveUrl, typeHint: avatar?.type ?? profile.profileImageType ?? undefined },
    { url: profile.effectivePhotoUrl, typeHint: profile.profileImageType ?? undefined },
    { url: profile.photoURL, typeHint: profile.profileImageType ?? undefined },
    { url: profile.customPhotoURL, typeHint: 'custom' },
  ];

  for (const candidate of candidates) {
    if (!candidate.url) continue;
    if (candidate.url.startsWith('memoji://')) {
      if (avatar?.memojiUrl) {
        return { url: avatar.memojiUrl, typeHint: 'memoji' };
      }
      const fallback = buildMemojiUrl(candidate.url, profile.defaultImageId);
      if (fallback) {
        return { url: fallback, typeHint: 'memoji' };
      }
      continue;
    }
    return { url: candidate.url, typeHint: candidate.typeHint };
  }

  return {};
}

export function resolveAvatarPresentation(profile?: AvatarProfileLike | null): AvatarPresentation {
  const initials = computeInitials(profile);
  const avatar = profile?.avatar;
  const backgroundSource = avatar?.background ?? profile?.profileBackground;
  const backgroundStyle = buildBackgroundStyle(backgroundSource);
  const { url: imageUrl, typeHint } = coerceImageUrl(profile);

  let fit: 'cover' | 'contain' = 'cover';
  let showBackground = !imageUrl;

  const type = (avatar?.type ?? profile?.profileImageType ?? typeHint)?.toLowerCase();
  if (type === 'memoji' || type === 'default') {
    fit = 'contain';
    showBackground = true;
  } else if (type === 'custom' || type === 'google') {
    fit = 'cover';
    showBackground = false;
  }

  // Apply a default gradient when a background is required.
  const finalBackgroundStyle = showBackground ? backgroundStyle : {};

  return {
    imageUrl,
    fit,
    backgroundStyle: finalBackgroundStyle,
    showBackground,
    initials,
  };
}
