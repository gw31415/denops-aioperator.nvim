-- Create a response_writer for the current buffer window
local function create_response_writer(opts)
	-- Setup options
	opts                  = vim.tbl_extend("force", {
		bufnr = vim.api.nvim_get_current_buf(),
		winnr = vim.api.nvim_get_current_win(),
		scroll = true,
	}, opts or {})
	local bufnr           = opts.bufnr
	local winnr           = opts.winnr
	local scroll          = opts.scroll

	local _, lnum, col, _ = unpack(vim.fn.getcharpos('.') or { 0, 0, 0, 0 })
	-- zero-indexed lnum
	local line_start      = lnum - 1

	local nsnum           = vim.api.nvim_create_namespace("aioperator")
	local extmarkid       = vim.api.nvim_buf_set_extmark(bufnr, nsnum, line_start, 0, {})

	local first_line      = vim.api.nvim_buf_get_lines(bufnr, line_start, line_start + 1, true)[1]
	-- string found to the left of the cursor
	local left_hand_side  = vim.fn.slice(first_line, 0, col - 1)
	-- string found to the right of the cursor
	local right_hand_side = vim.fn.slice(first_line, col - 1)

	vim.api.nvim_buf_set_lines(bufnr, line_start, line_start, true, {})

	-- Store entire response: initial value is the string that was initially to the right of the cursor
	local writing = left_hand_side
	return function(replacement)
		-- Changed to modifiable
		vim.api.nvim_set_option_value('modifiable', true, { buf = bufnr })

		-- Delete the currently written response
		local num_lines = #(vim.split(writing, "\n", {}))
		vim.api.nvim_buf_call(bufnr, vim.cmd.undojoin)
		vim.api.nvim_buf_set_lines(bufnr, line_start, line_start + num_lines, false, {})


		-- Update the line start to wherever the extmark is now
		line_start = vim.api.nvim_buf_get_extmark_by_id(bufnr, nsnum, extmarkid, {})[1]

		-- Write out the latest
		writing = left_hand_side .. replacement
		local lines = vim.split(writing .. right_hand_side, "\n", {})
		vim.api.nvim_buf_call(bufnr, vim.cmd.undojoin)
		vim.api.nvim_buf_set_lines(bufnr, line_start, line_start, false, lines)

		-- Changed to unmodifiable
		vim.api.nvim_set_option_value('modifiable', false, { buf = bufnr })

		-- Scroll
		if scroll and #lines > 1 and bufnr == vim.fn.winbufnr(winnr) then
			vim.api.nvim_win_call(winnr, function() vim.cmd "noau norm! zb" end)
		end
	end
end

--  Operatorfunc that follows the instructions to transform and replace text objects.
function _G._aioperator_opfunc(type)
	if not type or type == '' then
		vim.api.nvim_set_option_value('operatorfunc', 'v:lua._aioperator_opfunc', {})
		return 'g@'
	elseif type == "block" then
		vim.notify("Block selection is not supported.", vim.log.levels.ERROR, { title = "AI Operator" })
		return
	end

	-- Add highlights
	local pos = {}
	local _, line1, col1, _ = unpack(vim.fn.getpos("'[") or { 0, 0, 0, 0 })
	local _, line2, col2, _ = unpack(vim.fn.getpos("']") or { 0, 0, 0, 0 })
	if type == "line" then
		col2 = #vim.fn.getline(line2)
	end
	for line = line1, math.min(line2, vim.fn.line("w$")) do
		if line ~= line1 and line ~= line2 then
			table.insert(pos, vim.fn.matchaddpos('Visual', { line }))
		else
			local str = vim.fn.getline(line)
			local start_idx = line == line1 and col1 or 1
			local end_idx = line == line2 and col2 or #str
			for i = start_idx, end_idx do
				table.insert(pos, vim.fn.matchaddpos('Visual', { { line, i } }))
			end
		end
	end
	vim.cmd.redraw()

	-- Reseive input
	local order = vim.fn.input("Instruction: ")

	-- Remove highlights
	for _, id in pairs(pos) do
		vim.fn.matchdelete(id)
	end
	vim.cmd.redraw()

	-- Exit if no input
	if order == "" then return end

	-- Note the value of virtualedit
	local ve = vim.api.nvim_get_option_value('ve', {})
	vim.api.nvim_set_option_value('ve', 'onemore', {}) -- To support deletion up to the end of the line.

	if type == "line" then
		vim.cmd "noau norm! '[V']c"
	else
		vim.cmd "noau norm! `[v`]d"
	end

	-- Change to normal-mode
	vim.api.nvim_feedkeys(
		vim.api.nvim_replace_termcodes('<esc>', true, false, true),
		'm', true
	)

	local source = vim.fn.getreg('"')

	local opts = vim.api.nvim_get_var('aioperator_opts')

	local ma = vim.api.nvim_get_option_value('modifiable', {})
	local responseWriterId = vim.fn["denops#callback#register"](create_response_writer(opts))

	local cursorIsEOF = vim.fn.line('.') == vim.fn.line('$')
	if cursorIsEOF then
		-- If it is the last line, move the cursor to the new empty line.
		vim.api.nvim_set_option_value('modifiable', true, {})
		vim.cmd [[undoj | exe "noau norm! o\<ESC>"]]
	end

	local function finally()
		vim.api.nvim_set_option_value('modifiable', ma, {})
		vim.api.nvim_set_option_value('ve', ve, {})
		vim.fn['denops#callback#unregister'](responseWriterId)
		if cursorIsEOF then
			vim.cmd.undojoin()
			vim.api.nvim_feedkeys(
				vim.api.nvim_replace_termcodes('dd', true, false, true),
				'n', true
			)
		end
	end

	-- Set nomodifiable
	vim.api.nvim_set_option_value('modifiable', false, {})

	vim.fn["denops#request_async"]('aioperator', 'start', {
		order,
		source,
		opts.openai or {},
		responseWriterId,
	}, finally, function(e)
		vim.notify(e.message, vim.log.levels.ERROR, { title = e.proto })
		finally()
	end)
end

return {
	opfunc = _G._aioperator_opfunc,
}
