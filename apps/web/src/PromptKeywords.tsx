/** Keyword clicks submit through the same command input path as physical keys. */
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
  const options = prompt.slice(opening + 1, closing).split('/');
  return (
    <>
      {prompt.slice(0, opening + 1)}
      {options.map((label, index) => {
        const parenthesized = /\(([A-Za-z0-9]+)\)/.exec(label)?.[1];
        const keyword = parenthesized ?? /^([A-Z0-9]+)/.exec(label)?.[1];
        return (
          <span key={`${index}-${label}`}>
            {index > 0 ? '/' : ''}
            {keyword ? (
              <button
                type="button"
                className="command-keyword"
                style={{
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                  color: 'inherit',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  font: 'inherit',
                }}
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
