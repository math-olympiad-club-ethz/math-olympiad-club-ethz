/* tree-fold.js — the trees' colours, and how a branch of a tree opens and closes, the same on the Problems page
   (bank-ui.js, the tree of topics) and on the Propose page (bank-propose-ui.js, its topics and its methods).  A branch slides to its height, its items
   fading in; a fold closes the branches open inside it first, the deepest first, each level a moment after the one inside
   it, its node turning to + as it goes: a fold that closes several levels shows each of them closing (three levels in
   under half a second; one level a little quicker than it opens). */
export const EASE = 'cubic-bezier(.4, 0, .2, 1)';
const OPEN_MS = 260, FOLD_MS = 240, FOLD_STEP = 100;
/* A first-level topic's colours, light and dark (bank/colours.py, in the page's tags), on the node that stands for it:
   everything inside takes them (site.css [data-topic]).  No topic: the node's own colour again. */
export function paint(node, tag) {
  const c = tag && tag.colour;
  for (const [i, name] of ['--c-light', '--c-dark'].entries()) {
    if (c) node.style.setProperty(name, c[i]); else node.style.removeProperty(name);
  }
}

export const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; } };

/* A branch's height from or to nothing; the clip keeps its lines that rise above it (site.css .tt li li::before).  A fold
   may wait `delay` ms, at its height.  A slide that starts while another runs on the same branch (+ then − at once) goes
   from where that one is, and only the last one to end takes the clip away. */
export function slide(ul, open, delay = 0) {
  if (!ul.animate || reducedMotion()) return Promise.resolve();
  const now = ul.getBoundingClientRect().height;
  for (const a of ul.getAnimations()) a.cancel();
  const h = open ? ul.getBoundingClientRect().height : now;
  const mine = ul._slide = (ul._slide || 0) + 1;
  ul.style.setProperty('clip-path', 'inset(-8px -100vw 0 -100vw)');
  const frames = [{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }];
  return ul.animate(open ? frames : frames.reverse(), { duration: open ? OPEN_MS : FOLD_MS, delay, easing: EASE, fill: open ? 'none' : 'both' })
    .finished.catch(() => {}).then(() => { if (ul._slide === mine) ul.style.removeProperty('clip-path'); });
}

/* The branch `old` (a <ul>) folds with the branches open inside it.  Resolves when it is folded: the caller then takes
   it away (or draws the tree again). */
export function foldBranch(old) {
  old.inert = true;                                   // going: no click, no focus lands in it any more
  const levels = [[old]];
  for (const ul of old.querySelectorAll('ul')) {
    let d = 1;
    for (let p = ul.parentElement.closest('ul'); p && p !== old; p = p.parentElement.closest('ul')) d++;
    (levels[d] = levels[d] || []).push(ul);
  }
  const deepest = levels.length - 1;
  let done = Promise.resolve();
  levels.forEach((uls, d) => {
    const delay = (deepest - d) * FOLD_STEP;
    for (const ul of uls) {
      const going = slide(ul, false, delay);
      if (!d) { done = going; continue; }
      const tg = ul.parentElement.querySelector(':scope > .tt-row > .tt-tg');
      if (tg) setTimeout(() => { tg.textContent = '+'; tg.setAttribute('aria-expanded', 'false'); }, reducedMotion() ? 0 : delay);
    }
  });
  return done;
}
