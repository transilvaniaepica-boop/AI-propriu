// Renderer "markdown-lite": blocuri de cod, bold, inline code, liste simple.
function renderInline(text, keyPrefix) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('`') && p.endsWith('`') && p.length > 1) {
      return <code key={`${keyPrefix}-${i}`}>{p.slice(1, -1)}</code>;
    }
    if (p.startsWith('**') && p.endsWith('**') && p.length > 3) {
      return <strong key={`${keyPrefix}-${i}`}>{p.slice(2, -2)}</strong>;
    }
    return p;
  });
}

export default function Markdown({ text }) {
  const blocks = [];
  const lines = String(text ?? '').split('\n');
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++; // sare peste delimitatorul de inchidere
      blocks.push(
        <pre key={k++}>
          <code className={lang}>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].trim().startsWith('```')) {
      para.push(lines[i]);
      i++;
    }
    if (para.length) {
      blocks.push(<p key={k++}>{para.map((l, j) => renderInline(l, `${k}-${j}`))}</p>);
    }
    i++;
  }

  return <div className="md">{blocks}</div>;
}
