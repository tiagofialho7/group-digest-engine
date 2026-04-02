import React from "react";

/**
 * Parse WhatsApp-style formatting into React elements.
 * Supports: *bold*, _italic_, ~strikethrough~, ```monospace```, `inline code`
 */
export function formatWhatsAppText(text: string): React.ReactNode[] {
  const parts = text.split(/(```[\s\S]*?```)/g);
  const result: React.ReactNode[] = [];

  parts.forEach((part, partIdx) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const code = part.slice(3, -3).trim();
      result.push(
        <code
          key={`code-${partIdx}`}
          className="block bg-muted/80 text-foreground rounded-md px-2.5 py-1.5 text-[11px] font-mono whitespace-pre-wrap my-1"
        >
          {code}
        </code>
      );
    } else {
      result.push(...parseInlineFormatting(part, partIdx));
    }
  });

  return result;
}

/** Convert a plain string (no formatting) into React nodes with line breaks */
function textWithBreaks(str: string, keyPrefix: string): React.ReactNode[] {
  const lines = str.split("\n");
  const nodes: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) nodes.push(<br key={`${keyPrefix}-br-${i}`} />);
    if (line) nodes.push(line);
  });
  return nodes;
}

function parseInlineFormatting(text: string, keyPrefix: number): React.ReactNode[] {
  const regex = /(\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~|`([^`\n]+)`)/g;

  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push(...textWithBreaks(text.slice(lastIndex, match.index), `t-${keyPrefix}-${lastIndex}`));
    }

    const [, , bold, italic, strike, inlineCode] = match;

    if (bold !== undefined) {
      result.push(
        <strong key={`b-${keyPrefix}-${match.index}`} className="font-semibold">
          {bold}
        </strong>
      );
    } else if (italic !== undefined) {
      result.push(
        <em key={`i-${keyPrefix}-${match.index}`}>
          {italic}
        </em>
      );
    } else if (strike !== undefined) {
      result.push(
        <del key={`s-${keyPrefix}-${match.index}`} className="text-muted-foreground">
          {strike}
        </del>
      );
    } else if (inlineCode !== undefined) {
      result.push(
        <code
          key={`ic-${keyPrefix}-${match.index}`}
          className="bg-muted/80 text-foreground rounded px-1 py-0.5 text-[11px] font-mono"
        >
          {inlineCode}
        </code>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result.push(...textWithBreaks(text.slice(lastIndex), `t-${keyPrefix}-${lastIndex}`));
  }

  return result.length > 0 ? result : textWithBreaks(text, `t-${keyPrefix}-0`);
}
