// Copyright 2026 The MathWorks, Inc.
// The gallery's front page: the list of pages.
import { byId, PAGES, startPage } from '../shell';

startPage();

const list = byId('pages');
for (const page of PAGES) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = `./${page.file}`;
  const title = document.createElement('strong');
  title.textContent = page.title;
  link.append(title, page.about);
  item.append(link);
  list.append(item);
}
