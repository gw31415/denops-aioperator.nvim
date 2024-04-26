# denops-aioperator.nvim

Text converting operator via OpenAI API.

## Installation & Config

```lua
vim.fn["dein#add"]("vim-denops/denops.vim") -- required
vim.fn["dein#add"]("gw31415/denops-aioperator.nvim")

-- Configuration
vim.api.nvim_set_var('aioperator_opts', {
	-- ↓This arg will be passed to LangChain's `ChatOpenAI` constructor.
	openai = {
		apiKey = "sk-********-****-****-****-************",
		-- If `apiKey` not specified explicitly, the environment variable `OPENAI_API_KEY` is used.

		-- More options: https://api.js.langchain.com/classes/langchain_openai.ChatOpenAI.html
	},

	-- scroll = false, -- Automatically scroll the window to the bottom. Default: true
})

-- Key mapping
vim.keymap.set({ "n", "x" }, "gG", function(arg) require 'aioperator'.opfunc(arg) end, { expr = true })
```

## Usage

This plugin provides only the operator function `require 'aioperator'.opfunc`. See `:help operator` for more information on how to use the operator.

1. Select or specify the text by textobj.
2. Press the key mapping you set in the configuration.
3. Input the instruction about the conversion you want to make.
4. Press Enter then the conversion result will be inserted.
