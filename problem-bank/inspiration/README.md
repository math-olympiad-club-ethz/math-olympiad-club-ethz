# Inspiration / source material (local only)

This folder is **git-ignored on purpose.** Drop your own books, past-competition
PDFs, and any reference material you use to find or build problems **here, on your
own machine** — it is never committed or published.

Why local-only:
- Inspiration sources are personal and differ from member to member.
- Many are copyrighted, and this repository is **public**.
- It keeps the repo small (no large binaries baked into git history).

Only this `README.md` is tracked; everything else under `inspiration/` is ignored
(see `.gitignore`). Nothing in here is used to build the website.

## Suggested layout

```
inspiration/
  problem_collection.tex   ← your notes: competition archives, websites, problems found, ideas
  competitions/<name>/     ← official papers, solutions, photos of solutions (bernoulli/, icmc/, putnam/, ...)
  books/                   ← problem books and textbooks
  handouts/                ← lecture notes, seminar handouts, problem lists found online
  proposals/               ← problems proposed to the club by people (one PDF per person or batch)
```

Use lowercase folder names without spaces or `&` (easier in the shell and in LaTeX paths).
