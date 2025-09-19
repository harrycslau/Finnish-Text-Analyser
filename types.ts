
export type WordData = {
  id: number;
  text: string;
};

export type SentenceData = {
  id: number;
  text: string;
  words: WordData[];
};

export type TooltipData = {
  x: number;
  y: number;
  text: string;
} | null;

export interface Voice {
    name: string;
    ssmlGender: 'MALE' | 'FEMALE' | 'NEUTRAL';
    languageCode: string;
}
