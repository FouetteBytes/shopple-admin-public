export interface AvatarBackground {
  id?: string | null;
  name?: string | null;
  type?: string | null;
  patternType?: string | null;
  colors?: string[];
  description?: string | null;
  isPremium?: boolean;
  patternConfig?: Record<string, unknown> | null;
  updatedAt?: string | null;
}

export interface AvatarData {
  type?: string | null;
  effectiveUrl?: string | null;
  resolvedUrl?: string | null;
  customPhotoURL?: string | null;
  googlePhotoURL?: string | null;
  defaultImageId?: string | null;
  memojiId?: string | null;
  memojiUrl?: string | null;
  background?: AvatarBackground | null;
  backgroundUpdatedAt?: string | null;
  fallbackInitials?: string | null;
  updatedAt?: string | null;
}
