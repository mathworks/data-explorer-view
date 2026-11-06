# `<dex-location-bar>`

Back, Forward and Up, then a breadcrumb of where the user is: one segment for each place on the
way down to it (Root › plant.sldd › Design Data › Kp), the last drawn as the current place. It
keeps no history and works out no path. Each press is a request, `dex-location-go`, naming Back,
Forward, Up or the segment pressed; the app decides where that goes, gives the bar the new
segments, and says by `canBack`, `canForward` and `canUp` which buttons can be used. A path too
long for the bar shrinks its segments, each label ending in an ellipsis, and a segment's `title`
says what its label leaves out.

```js
import { defineLocationBar } from 'data-explorer-view/app-shell';

defineLocationBar();
const bar = document.querySelector('dex-location-bar');
bar.segments = [
  { label: 'Root' },
  { label: 'plant.sldd', icon: 'simulinkDataDictionary_FT', title: '/work/plant.sldd' },
  { label: 'Design Data' },
  { label: 'Kp', icon: 'parameter' }, // an icon id, or a data-model kind
];
bar.canBack = places.canBack;
bar.canUp = true;
bar.addEventListener('dex-location-go', (e) => {
  const { to } = e.detail; // 'back', 'forward', 'up', or a segment's index
  go(to);
});
```

Back and Forward send nothing while their `can-back` and `can-forward` are off, and Up nothing
while `can-up` is. A press of the last segment, the current place, is sent all the same.

<!-- Everything below is written by scripts/gen-widget-docs.mjs from custom-elements.json. -->
