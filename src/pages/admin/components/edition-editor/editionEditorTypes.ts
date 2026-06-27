export type AdminNotice = {
  kind: 'success' | 'warning' | 'error';
  message: string;
};

export type StudioMode = 'cards' | 'design' | 'output';

export type CardViewMode = 'print' | 'original' | 'gallery';

export type SaveEditionResponse = {
  success?: boolean;
  warnings?: string[];
  error?: string;
};

export function getStudioMode(value: string | null): StudioMode {
  if (value === 'design' || value === 'output') return value;
  return 'cards';
}
