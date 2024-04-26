# denops-aioperator.nvim

Text converting operator via OpenAI API.

![rec](https://github.com/gw31415/denops-aioperator.nvim/assets/24710985/fb83de00-b972-4cdc-bb9e-71acd3576876)

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
vim.keymap.set({ "n", "x" }, "gG", function(arg)
	return require 'aioperator'.opfunc(arg)
end, { expr = true })
```

## Usage

This plugin provides only the operator function `require 'aioperator'.opfunc`. See `:help operator` for more information on how to use the operator.

1. Press the operator key you set and select the textobj you want to convert.
   - or, you can use the visual mode to select the text before pressing the operator key.
2. Input the instruction about the conversion you want to make.
3. Press Enter then the conversion result will be inserted.
