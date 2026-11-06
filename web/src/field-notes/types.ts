import type { GraphSnapshot } from '../types';

/** Reader presentation only; never persisted in the board's event log. */
export type FieldNotesCover = {
  title: string;
  subtitle: string;
  accent: string;
  logo: string;
};

export type FieldNotesDocumentProps = {
  snapshot: GraphSnapshot;
  cover: FieldNotesCover;
  theme: 'light' | 'dark';
  onContinue: () => void;
  onNode: (id: string) => void;
  onCheckpoint?: (id: string) => void;
};

export type FieldNotesExportOptions = {
  title: string;
  locale: string;
};
