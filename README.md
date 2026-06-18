# denops-aioperator.nvim

Text converting operator via the OpenAI-compatible API (Chat Completions streaming).

Uses OpenAI's official endpoint by default. Set `base_url` to use any
OpenAI-compatible provider such as OpenRouter.

![rec](https://github.com/gw31415/denops-aioperator.nvim/assets/24710985/fb83de00-b972-4cdc-bb9e-71acd3576876)

## Installation & Config

```lua
vim.fn["dein#add"]("vim-denops/denops.vim") -- required
vim.fn["dein#add"]("gw31415/denops-aioperator.nvim")

-- Configuration
vim.api.nvim_set_var('aioperator_opts', {
	-- ↓These args configure the OpenAI-compatible request.
	openai = {
		api_key = "sk-********-****-****-****-************",
		-- If `api_key` is not specified explicitly, the environment variable
		-- `OPENAI_API_KEY` is used.
		model = "gpt-4o-mini",
		-- base_url = "https://api.openai.com/v1",  -- default
	},

-- scroll = false, -- Automatically scroll the window to the bottom. Default: true
})

-- Key mapping
vim.keymap.set({ "n", "x" }, "gG", function(arg)
	return require 'aioperator'.opfunc(arg)
end, { expr = true })
```

## Usage

This plugin provides only the operator function `require 'aioperator'.opfunc`.
See `:help operator` for more information on how to use the operator.

1. Press the operator key you set and select the textobj you want to convert.
   - or, you can use the visual mode to select the text before pressing the
     operator key.
2. Input the instruction about the conversion you want to make.
3. Press Enter then the conversion result will be inserted.

## Using OpenRouter

To use [OpenRouter](https://openrouter.ai), set `base_url` to the OpenRouter
endpoint and provide your OpenRouter API key:

```lua
vim.api.nvim_set_var('aioperator_opts', {
	openai = {
		api_key = "sk-or-v1-********************************",  -- OpenRouter key
		model = "openai/gpt-4o-mini",  -- OpenRouter provider/model format
		base_url = "https://openrouter.ai/api/v1",
	},
})
```

You can also set the key via environment variable:

```sh
export OPENAI_API_KEY="sk-or-v1-..."
```

## `g:aioperator_opts.openai` keys

- `api_key` — API key string. Falls back to `OPENAI_API_KEY` env var.
- `model` — Model name. Defaults to `gpt-4o-mini`. For OpenRouter, use
  `provider/model` format (e.g. `openai/gpt-4o-mini`,
  `anthropic/claude-3.5-sonnet`).
- `base_url` — API endpoint base URL. Defaults to `https://api.openai.com/v1`.
  Set to `https://openrouter.ai/api/v1` for OpenRouter.
- `seed` — Optional integer seed for deterministic output.

## Breaking Changes

- This plugin now uses **Chat Completions streaming** (SSE) instead of the
  OpenAI Realtime WebSocket API.
- The default model is `gpt-4o-mini` (WebSocket-only models like
  `gpt-realtime-mini` are no longer used).
- `g:aioperator_opts.openai` supports:
  - `api_key`
  - `model`
  - `base_url` (optional — enables OpenRouter or other compatible providers)
  - `seed` (optional, integer)
- Removed WebSocket-specific options. Legacy keys (`apiKey`, `baseURL`,
  `organization`, `project`, `temperature`) are not supported.
