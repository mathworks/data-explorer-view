// Copyright 2026 The MathWorks, Inc.
// The context menu alone: items with icons, shortcuts, a separator and a disabled item that
// says why, opened by a right-click or the keyboard.
import { defineContextMenu, type ContextMenuItem, type DexContextMenu } from 'data-explorer-view/context-menu';
import { byId, logEvents, startPage } from '../shell';

startPage();
defineContextMenu(); // <dex-context-menu>

const menu = byId<DexContextMenu>('menu');
const target = byId('target');
logEvents(menu, ['dex-action'], byId('event-log'));

// What the tree table's menu holds for an entry; an app builds it with buildContextMenuItems
// (data-explorer-view/tree-table) from the table's rows and selection.
const ITEMS: ContextMenuItem[] = [
  { id: 'cut', label: 'Cut "Gain"', icon: 'cut', shortcut: '⌘X' },
  { id: 'copy', label: 'Copy "Gain"', icon: 'copy', shortcut: '⌘C' },
  { id: 'paste', label: 'Paste', icon: 'paste', shortcut: '⌘V', disabled: true, reason: 'The clipboard is empty' },
  { id: 'sep', label: '', separator: true },
  { id: 'delete', label: 'Delete "Gain"', icon: 'delete', shortcut: '⌫' },
];

target.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  menu.show(e.clientX, e.clientY, ITEMS);
});
target.addEventListener('keydown', (e) => {
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    e.preventDefault();
    const r = target.getBoundingClientRect();
    menu.show(r.left, r.bottom, ITEMS);
  }
});
