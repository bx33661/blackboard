/**
 * Where this viewer's API and event stream live. A host can embed the page under a
 * token prefix (`/pinwhy-viewer/<token>/`), and a static export has no origin at
 * all, so every request resolves against the document base instead of the root.
 * Without a document (Node tests, server-side rendering) the path stays as written.
 */
export function endpoint(path: string): string {
  const base = typeof document === 'undefined' ? '' : document.baseURI;
  if (!base) return path;
  try {
    return new URL(`.${path}`, base).href;
  } catch {
    return path;
  }
}
