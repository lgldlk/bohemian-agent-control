import { useMemo, useState } from 'react';

type PreviewItem = {
  id: string;
  label: string;
  kind: 'code' | 'image' | 'markdown';
};

const ITEMS: PreviewItem[] = [
  { id: 'code', label: 'Source range', kind: 'code' },
  { id: 'image', label: 'Embedded image', kind: 'image' },
  { id: 'markdown', label: 'Rendered Markdown', kind: 'markdown' },
];

export function ExamplePanel() {
  const [selectedId, setSelectedId] = useState('code');
  const selected = useMemo(
    () => ITEMS.find((item) => item.id === selectedId) ?? ITEMS[0],
    [selectedId],
  );

  return (
    <section className="preview-panel">
      <header>
        <h1>Resource Preview Gallery</h1>
        <span>{selected.kind}</span>
      </header>

      <nav aria-label="Preview type">
        {ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === selectedId}
            onClick={() => setSelectedId(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <article>
        <strong>{selected.label}</strong>
        <p>Move the pointer over this node and scroll its content.</p>
      </article>
    </section>
  );
}
