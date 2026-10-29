// Copyright 2026 The MathWorks, Inc.
// The built gallery runs under the policy a careful app ships: `style-src 'self'` (no inline
// styles) and `img-src 'self'` (no data: images). The preview server sends it and every page
// carries it, and each engine enforces it, so every other test, which fails on a console error,
// also fails on a widget that writes an inline style or draws an icon from a data: URL.
import { expect, PAGES, test } from './gallery';

const STRICT = ["style-src 'self';", "img-src 'self';"];

for (const path of PAGES) {
  test(`${path} is served and drawn under the strict policy`, async ({ page }) => {
    const response = await page.goto(path);
    await page.waitForLoadState('networkidle');
    const header = response?.headers()['content-security-policy'] ?? '';
    const meta = (await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')) ?? '';
    for (const [where, policy] of [
      ['header', header],
      ['meta', meta],
    ]) {
      for (const directive of STRICT) expect(policy, where).toContain(directive);
      expect(policy, where).not.toMatch(/unsafe-inline|data:/);
    }
  });
}

test('the engine enforces it: an inline style and a data: image are refused', async ({ page, problems }) => {
  await page.goto('composed.html');
  const result = await page.evaluate(async () => {
    const refused: string[] = [];
    document.addEventListener('securitypolicyviolation', (e) => refused.push(e.violatedDirective));
    const style = document.createElement('style');
    style.textContent = 'body { outline: 3px solid red; }';
    document.head.append(style);
    const img = new Image();
    await new Promise((settled) => {
      img.onload = img.onerror = settled;
      img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    });
    // The violation events are queued as tasks: let them arrive.
    await new Promise((later) => setTimeout(later, 100));
    return { refused, outline: getComputedStyle(document.body).outlineStyle, width: img.naturalWidth };
  });
  expect(result.outline).toBe('none');
  expect(result.width).toBe(0);
  // Each is refused once by each policy, the header's and the meta's, and by nothing else.
  const kinds = result.refused.map((d) => (d.startsWith('style-src') ? 'style' : d.startsWith('img-src') ? 'img' : d));
  expect([...new Set(kinds)].sort()).toEqual(['img', 'style']);
  // Each engine reports the refusals on the console as well. Those are this test's own; every
  // other test fails on them.
  const own = (p: string) => /style-src|img-src|data:image\/gif/.test(p);
  expect(problems.filter(own).length).toBeGreaterThan(0);
  problems.splice(0, problems.length, ...problems.filter((p) => !own(p)));
});
