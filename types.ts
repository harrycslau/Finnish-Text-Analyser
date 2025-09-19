
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

export type SynthesizedSpeech = {
  data: string;
  mimeType: string;
};
