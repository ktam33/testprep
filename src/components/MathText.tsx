import { Fragment } from 'react';
import katex from 'katex';

// Renders a string that may contain LaTeX math. Handles the \( \) and \[ \] delimiters
// the generator uses, and — because the model is not always consistent about wrapping
// every answer choice — falls back to rendering a delimiter-less string that contains a
// LaTeX command (e.g. a bare "\dfrac{1}{12}" choice) entirely as math.
//
// `$` is deliberately NOT treated as a math delimiter: it collides with currency ("$18",
// "between $12 and $20"), which is common in these questions. All real math uses \( \).
//
// KaTeX is run with throwOnError:false so malformed LaTeX degrades to visibly-flagged
// text rather than crashing the render.

function renderTex(tex: string, displayMode: boolean): string {
  return katex.renderToString(tex, { displayMode, throwOnError: false });
}

// Capture group so String.split keeps the delimited chunks.
const MATH_SEGMENT = /(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;

// A backslash-command with no surrounding delimiters (bare answer choices).
const BARE_LATEX = /\\[a-zA-Z]/;

export default function MathText({ children, className }: { children: string | null | undefined; className?: string }) {
  const text = children ?? '';
  const hasDelimiter = /\\\(|\\\[/.test(text);

  if (!hasDelimiter) {
    if (BARE_LATEX.test(text)) {
      return <span className={className} dangerouslySetInnerHTML={{ __html: renderTex(text, false) }} />;
    }
    return <span className={className}>{text}</span>;
  }

  const parts = text.split(MATH_SEGMENT);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!part) return <Fragment key={i} />;
        if (part.startsWith('\\(') && part.endsWith('\\)')) {
          return <span key={i} dangerouslySetInnerHTML={{ __html: renderTex(part.slice(2, -2), false) }} />;
        }
        if (part.startsWith('\\[') && part.endsWith('\\]')) {
          return <span key={i} dangerouslySetInnerHTML={{ __html: renderTex(part.slice(2, -2), true) }} />;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
