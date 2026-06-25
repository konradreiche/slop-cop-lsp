# slop-cop-lsp

An LSP server that detects LLM-generated prose patterns and surfaces them as diagnostics in your editor. Works with Neovim, VS Code, or any LSP-compatible editor.

This is a fork of [slop-cop](https://awnist.com/slop-cop) — a browser-based editor for the same detectors. See the original project for a description of the full rule set and web UI.

## Install

```bash
npm install -g slop-cop-lsp
```

Requires Node.js 18+.

## Neovim

Add to your `init.lua` or a filetype plugin:

```lua
vim.api.nvim_create_autocmd('FileType', {
  pattern = { 'markdown', 'text', 'gitcommit' },
  callback = function()
    vim.lsp.start({
      name = 'slop-cop',
      cmd = { 'slop-cop-lsp', '--stdio' },
      root_dir = vim.fn.getcwd(),
    })
  end,
})
```

Diagnostics appear inline and in the location list. Each diagnostic carries the rule ID as its `code` field, so you can filter by rule.

## What gets flagged

36 client-side rules run on every file open and change — no API key needed. A sample:

- Overused intensifiers (`crucial`, `robust`, `unprecedented`, `leverage`, `delve`)
- Elevated register (`utilize`, `commence`, `facilitate`, `endeavor`)
- Connector addiction (paragraph-opening `Furthermore`, `Moreover`, `Additionally`)
- Rhetorical question immediately answered in the next sentence
- Negation pivot (`not X, but Y`)
- Triple construction (`X, Y, and Z` — the LLM default)
- Dramatic fragment (1–4 word standalone paragraph)
- Vague attribution (`experts argue`, `studies show`, `research suggests`)
- Listicle instinct (bullet lists with exactly 3, 5, or 7 items)

See the [original project](https://awnist.com/slop-cop) for the full list.

## Building from source

```bash
pnpm install
pnpm lsp:build        # outputs lsp/dist/server.js
node lsp/dist/server.js --stdio
```

## Source rules

The pattern taxonomy is based on [LLM_PROSE_TELLS.md](https://git.eeqj.de/sneak/prompts/src/branch/main/prompts/LLM_PROSE_TELLS.md), [Wikipedia: Signs of AI Writing](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing), and [tropes.md](https://tropes.fyi/tropes-md).
