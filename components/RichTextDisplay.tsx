import React, { useMemo } from 'react';

interface RichTextDisplayProps {
  htmlContent: string;
  speakingSentenceId: number | null;
  onWordClick: (event: React.MouseEvent<HTMLSpanElement>) => void;
}

// Maps character offsets to sentence IDs for highlighting during TTS.
const createSentenceMap = (html: string): ((offset: number) => number) => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const plainText = tempDiv.innerText;

    const sentenceRegex = /[^.!?]+[.!?]?/g;
    const sentences = plainText.match(sentenceRegex) || [];
    const sentenceEndOffsets: number[] = [];
    let cumulativeLength = 0;
    for (const sentence of sentences) {
        cumulativeLength += sentence.length;
        sentenceEndOffsets.push(cumulativeLength);
    }

    return (charOffset: number): number => {
        for (let i = 0; i < sentenceEndOffsets.length; i++) {
            if (charOffset < sentenceEndOffsets[i]) {
                return i;
            }
        }
        return -1; // Not found
    };
};

/**
 * Parses an HTML string into a tree of React elements, wrapping words in clickable spans
 * and preserving allowed styling.
 */
const parseHtmlToReact = (
    html: string,
    speakingSentenceId: number | null,
    onWordClick: (event: React.MouseEvent<HTMLSpanElement>) => void
) => {
    if (typeof window === 'undefined') return [];
    
    const sentenceMap = createSentenceMap(html);
    let charOffset = 0;
    let wordKey = 0;

    const transformNode = (node: Node): React.ReactNode => {
        if (node.nodeType === 3) { // Text node
            const text = node.textContent || '';
            const wordsAndSpaces = text.split(/(\s+)/); // Split on whitespace, keeping it
            
            return wordsAndSpaces.map((segment, index) => {
                if (segment.trim().length > 0) { // It's a word
                    const sentenceId = sentenceMap(charOffset);
                    const isHighlighted = sentenceId === speakingSentenceId;
                    charOffset += segment.length;
                    
                    return (
                        <span
                            key={`word-${wordKey++}`}
                            onClick={onWordClick}
                            className={isHighlighted ? 'sentence-highlight' : 'cursor-pointer'}
                        >
                            {segment}
                        </span>
                    );
                } else { // It's whitespace
                    charOffset += segment.length;
                    return segment;
                }
            });
        }

        if (node.nodeType === 1) { // Element node
            const element = node as HTMLElement;
            const tagName = element.tagName.toLowerCase();

            const children = Array.from(element.childNodes).map((child, i) => (
                <React.Fragment key={i}>{transformNode(child)}</React.Fragment>
            ));
            
            // Convert style string to a React style object
            const style: React.CSSProperties = {};
            if (element.getAttribute('style')) {
                element.getAttribute('style')!.split(';').forEach(rule => {
                    const [key, value] = rule.split(':');
                    if (key && value) {
                        const camelKey = key.trim().replace(/-(\w)/g, (_, c) => c.toUpperCase());
                        style[camelKey] = value.trim();
                    }
                });
            }

            return React.createElement(tagName, { style }, children);
        }

        return null;
    };

    const doc = new DOMParser().parseFromString(html, 'text/html');
    // Defensive check: DOMParser with 'text/html' should always create a body, but it's safer to check.
    if (!doc.body) {
        return [];
    }
    
    return Array.from(doc.body.childNodes).map((node, i) => (
        <React.Fragment key={i}>{transformNode(node)}</React.Fragment>
    ));
};

const RichTextDisplay: React.FC<RichTextDisplayProps> = ({
  htmlContent,
  speakingSentenceId,
  onWordClick,
}) => {
    const reactNodes = useMemo(() => 
        parseHtmlToReact(htmlContent, speakingSentenceId, onWordClick), 
        [htmlContent, speakingSentenceId, onWordClick]
    );

    return (
        <div className="text-xl sm:text-2xl text-gray-200 leading-relaxed text-left">
            {reactNodes}
        </div>
    );
};

export default RichTextDisplay;