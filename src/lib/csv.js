// Reflect — tiny CSV export utility shared by the five report tabs. Pure
// string-building (toCsv) is node-testable; downloadCsv is a thin browser-only
// wrapper around Blob/anchor-click, guarded for non-browser environments.

// Escape a single field per RFC4180-ish rules: wrap in double-quotes and
// double any inner quotes when the field contains a comma, a quote, or a
// newline (either \n or \r).
function escapeField(field) {
  const s = String(field);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// toCsv(['Category','Amount'], [['Rent', 40000], ['Food, drink', 12000]])
// -> 'Category,Amount\r\nRent,40000\r\n"Food, drink",12000'
export function toCsv(headerRow, rows) {
  const lines = [headerRow, ...rows].map(row => row.map(escapeField).join(','));
  return lines.join('\r\n');
}

// Browser-only: builds a Blob, clicks a throwaway <a download>, then revokes
// the object URL on the next tick. No-ops under node/test (no `document`).
export function downloadCsv(filename, csv) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = filename;
  a.href = url;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
