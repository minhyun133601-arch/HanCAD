/** Keyword token of an option label such as "닫기(C)" or "3P". */
export function keywordOf(label: string): string | undefined {
  return /\(([A-Za-z0-9]+)\)/.exec(label)?.[1] ?? /^([A-Z0-9]+)/.exec(label)?.[1];
}

/** Bracketed "[A/B/C]" option labels of a prompt; empty when the prompt has none. */
export function promptOptions(prompt: string): string[] {
  const opening = prompt.indexOf('['),
    closing = prompt.indexOf(']', opening);
  return opening < 0 || closing < 0 ? [] : prompt.slice(opening + 1, closing).split('/');
}

/**
 * Keyword clicks submit through the same command input path as physical keys.
 * The active prompt shows keywords as buttons separated by spaces; the slash stays
 * in the text content so copied prompts keep AutoCAD's "[A/B]" history form.
 */
export function PromptKeywords({
  prompt,
  execute,
}: {
  prompt: string;
  execute: (keyword: string) => void;
}) {
  const opening = prompt.indexOf('['),
    closing = prompt.indexOf(']', opening);
  if (opening < 0 || closing < 0) return <>{prompt}</>;
  const options = promptOptions(prompt);
  return (
    <>
      {prompt.slice(0, opening + 1)}
      {options.map((label, index) => {
        const keyword = keywordOf(label);
        return (
          <span key={`${index}-${label}`}>
            {index > 0 ? <span className="keyword-separator">/</span> : ''}
            {keyword ? (
              <button
                type="button"
                className="command-keyword"
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => execute(keyword)}
              >
                {label}
              </button>
            ) : (
              label
            )}
          </span>
        );
      })}
      {prompt.slice(closing)}
    </>
  );
}
