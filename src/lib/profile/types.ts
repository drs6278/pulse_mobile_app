export const ageBands = ['unknown', 'under_18', '18_to_20', '21_plus'] as const;
export type AgeBand = typeof ageBands[number];
export const ageLabels: Record<AgeBand, string> = { unknown: 'Prefer not to say', under_18: 'Under 18', '18_to_20': '18–20', '21_plus': '21 or older' };
export type PublicProfile = { user_id: string; display_name: string; bio: string; avatar_path: string | null; version: number; updated_at: string };
export type PrivateProfile = { user_id: string; age_band: AgeBand; account_state: 'active' | 'suspended' | 'deleting'; profile_hidden: boolean; created_at: string };
export type OwnProfile = { public: PublicProfile | null; private: PrivateProfile };
export type ProfileDraft = { display_name: string; bio: string; age_band: AgeBand };
export type PickedAvatar = { bytes: Uint8Array; mime: string; uri: string; dispose: () => void };
export const reportReasons = ['harassment', 'impersonation', 'inappropriate_content', 'spam', 'other'] as const;
export type ReportReason = typeof reportReasons[number];
export const reportLabels: Record<ReportReason, string> = { harassment: 'Harassment or bullying', impersonation: 'Impersonation', inappropriate_content: 'Inappropriate photo or bio', spam: 'Spam', other: 'Something else' };
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function validateProfile(draft: ProfileDraft) {
  const errors: Partial<Record<keyof ProfileDraft, string>> = {};
  const name = draft.display_name.trim();
  if (!name || Array.from(name).length > 60 || /[\u0000-\u001f\u007f]/.test(name)) errors.display_name = 'Use 1–60 characters without line breaks.';
  if (Array.from(draft.bio.trim()).length > 280) errors.bio = 'Keep your bio to 280 characters.';
  if (!ageBands.includes(draft.age_band)) errors.age_band = 'Choose an age eligibility option.';
  return errors;
}
export function profileInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? '').join('').toLocaleUpperCase() || 'P';
}
