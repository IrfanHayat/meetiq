export const colors = {
  ink: '#161126',
  ink2: '#5C566F',
  ink3: '#8A849C',
  line: '#E6E1F0',
  bg: '#F5F3FB',
  card: '#FFFFFF',
  accent: '#5B4DFF',
  accentSoft: '#EEECFF',
  accentDeep: '#3A2BD6',
  good: '#0E9F6E',
  danger: '#E24747',
  gold: '#F3B23C',
  goldDeep: '#D99212',
  white: '#FFFFFF',
};

export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extra: 'PlusJakartaSans_800ExtraBold',
};

export function folderVisual(icon?: string, color?: string) {
  switch (icon) {
    case 'meetings':
      return { bg: '#EEECFF', fg: '#5B4DFF', ion: 'file-text' as const };
    case 'lectures':
      return { bg: '#FFF4DE', fg: '#D99212', ion: 'book-open' as const };
    case 'interviews':
      return { bg: '#E8F8F1', fg: '#0E9F6E', ion: 'users' as const };
    case 'ideas':
      return { bg: '#FDECEC', fg: '#E24747', ion: 'star' as const };
    case 'unfiled':
      return { bg: '#EEEFF3', fg: '#5C566F', ion: 'folder' as const };
    default:
      return { bg: '#EEECFF', fg: color || colors.accent, ion: 'folder' as const };
  }
}

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English (US)' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ur', label: 'Urdu' },
  { code: 'ar', label: 'Arabic' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'tr', label: 'Turkish' },
  { code: 'id', label: 'Indonesian' },
];

export function languageLabel(code?: string): string {
  return LANGUAGES.find((item) => item.code === code)?.label || 'English (US)';
}
