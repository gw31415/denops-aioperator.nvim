-- Create a response_writer for the current buffer window
local function create_response_writer(opts)
	-- Setup options
	opts                  = vim.tbl_extend('force', {
		bufnr = vim.api.nvim_get_current_buf(),
		winnr = vim.api.nvim_get_current_win(),
		scroll = true,
		on_open = function() end,
		anchor = nil,
	}, opts or {})
	local bufnr           = opts.bufnr
	local winnr           = opts.winnr
	local scroll          = opts.scroll
	local on_open         = opts.on_open

	local _, lnum, col, _ = unpack(vim.fn.getcharpos '.' or { 0, 0, 0, 0 })
	if type(opts.anchor) == 'table' then
		lnum = tonumber(opts.anchor[1] or lnum) or lnum
		col = tonumber(opts.anchor[2] or col) or col
	end
	local line_start      = lnum - 1 -- zero-indexed lnum
	local line_col        = col - 1

	local nsnum           = vim.api.nvim_create_namespace 'aioperator'
	local extmarkid       = vim.api.nvim_buf_set_extmark(bufnr, nsnum, line_start, line_col, {
		right_gravity = true,
	})

	local is_modifiable   = false

	local function set_modifiable(value)
		if is_modifiable == value then
			return
		end
		vim.api.nvim_set_option_value('modifiable', value, { buf = bufnr })
		is_modifiable = value
	end

	local function get_insert_pos()
		local pos = vim.api.nvim_buf_get_extmark_by_id(bufnr, nsnum, extmarkid, {})
		if not pos or #pos < 2 then
			return nil, nil
		end
		return pos[1], pos[2]
	end

	local function insert_text(text)
		if text == '' then
			return
		end
		local row, colnum = get_insert_pos()
		if row == nil or colnum == nil then
			return
		end

		set_modifiable(true)
		local lines = vim.split(text, '\n', { plain = true, trimempty = false })
		vim.api.nvim_buf_call(bufnr, vim.cmd.undojoin)
		vim.api.nvim_buf_set_text(bufnr, row, colnum, row, colnum, lines)

		if not (scroll and bufnr == vim.fn.winbufnr(winnr)) then
			return
		end

		-- Follow the insertion point: move the cursor to the end of the
		-- newly inserted text and scroll smoothly — only by the minimum
		-- number of lines needed to keep the cursor visible.
		vim.api.nvim_win_call(winnr, function()
			local mpos = vim.api.nvim_buf_get_extmark_by_id(bufnr, nsnum, extmarkid, {})
			if not mpos or #mpos < 2 then
				return
			end
			local new_lnum = mpos[1] + 1
			local new_col  = mpos[2]

			local view    = vim.fn.winsaveview()
			local botline = vim.fn.line('w$')

			-- Advance the viewport only when the cursor falls below the
			-- last visible line, and only by the exact delta — no jumps.
			if new_lnum > botline then
				view.topline = math.min(view.topline + (new_lnum - botline), vim.fn.line('$'))
			end
			view.lnum     = new_lnum
			view.col      = new_col
			view.curswant = new_col
			vim.fn.winrestview(view)
		end)
	end

	return function(event)
		if type(event) ~= 'table' then
			-- Backward compatible path for string payloads.
			insert_text(tostring(event))
			return
		end

		if event.type == 'delta' then
			insert_text(type(event.text) == 'string' and event.text or '')
		elseif event.type == 'opened' then
			set_modifiable(true)
			on_open()
			set_modifiable(false)
		elseif event.type == 'done' then
			set_modifiable(false)
		end
	end
end

--  Operatorfunc that follows the instructions to transform and replace text objects.
function _G._aioperator_opfunc(type)
	if not type or type == '' then
		vim.api.nvim_set_option_value('operatorfunc', 'v:lua._aioperator_opfunc', {})
		return 'g@'
	elseif type == 'block' then
		vim.notify('Block selection is not supported.', vim.log.levels.ERROR, { title = 'AI Operator' })
		return
	end

	-- Add highlights
	local pos = {}
	local _, line1, col1, _ = unpack(vim.fn.getpos "'[" or { 0, 0, 0, 0 })
	local _, line2, col2, _ = unpack(vim.fn.getpos "']" or { 0, 0, 0, 0 })
	if type == 'line' then
		col2 = #vim.fn.getline(line2)
	end
	for line = line1, math.min(line2, vim.fn.line 'w$') do
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
	local instruction = vim.fn.input 'Instruction: '

	-- Remove highlights
	for _, id in pairs(pos) do
		vim.fn.matchdelete(id)
	end
	vim.cmd.redraw()

	-- Exit if no input
	if instruction == '' then return end

	local source
	if type == 'line' then
		source = table.concat(vim.api.nvim_buf_get_lines(0, line1 - 1, line2, true), '\n') .. '\n'
	else
		source = table.concat(vim.api.nvim_buf_get_text(0, line1 - 1, col1 - 1, line2 - 1, col2, {}), '\n')
	end

	-- Note the value of virtualedit
	local ve = vim.api.nvim_get_option_value('ve', {})
	vim.api.nvim_set_option_value('ve', 'onemore', {}) -- To support deletion up to the end of the line.

	local opts = vim.api.nvim_get_var 'aioperator_opts'

	local ma = vim.api.nvim_get_option_value('modifiable', {})
	local writerOpts = vim.tbl_extend('force', opts, {
		anchor = { line1, col1 },
		on_open = function()
			if type == 'line' then
				vim.cmd "noau norm! '[V']c"
			else
				vim.cmd 'noau norm! `[v`]d'
			end
			-- Change to normal-mode
			vim.api.nvim_feedkeys(
				vim.api.nvim_replace_termcodes('<esc>', true, false, true),
				'm', true
			)
		end,
	})
	local responseWriterId = vim.fn['denops#callback#register'](create_response_writer(writerOpts))

	-- Save the last-change marks: adding an extra line at EOF overwrites
	-- '[ / '] , which on_open() relies on to delete the original text.
	local mark_start = vim.fn.getpos("'[")
	local mark_end   = vim.fn.getpos("']")

	local cursorIsEOF = vim.fn.line '.' == vim.fn.line '$'
	local eofExtmarkId
	if cursorIsEOF then
		-- If the cursor is on the last line, add a new empty line below
		-- so that on_open()'s change operation has a line to land on.
		vim.api.nvim_set_option_value('modifiable', true, {})
		vim.cmd [[undoj | exe "noau norm! o\<ESC>"]]
		-- Track the extra line with an extmark (left-gravity) so that
		-- finally() can delete it by position, not by cursor.
		local ns = vim.api.nvim_create_namespace 'aioperator'
		eofExtmarkId = vim.api.nvim_buf_set_extmark(0, ns, vim.fn.line('.') - 1, 0, {
			right_gravity = false,
		})
	end

	-- Restore the marks that cursorIsEOF handling may have overwritten.
	vim.fn.setpos("'[", mark_start)
	vim.fn.setpos("']", mark_end)

	local function finally()
		if eofExtmarkId then
			local ns  = vim.api.nvim_create_namespace 'aioperator'
			local pos = vim.api.nvim_buf_get_extmark_by_id(0, ns, eofExtmarkId, {})
			if pos and pos[1] then
				local del_row = pos[1]
				vim.api.nvim_set_option_value('modifiable', true, {})
				vim.cmd.undojoin()
				vim.api.nvim_buf_set_lines(0, del_row, del_row + 1, false, {})
			end
			vim.api.nvim_buf_del_extmark(0, ns, eofExtmarkId)
		end
		vim.api.nvim_set_option_value('modifiable', ma, {})
		vim.api.nvim_set_option_value('ve', ve, {})
		vim.fn['denops#callback#unregister'](responseWriterId)
	end

	-- Set nomodifiable
	vim.api.nvim_set_option_value('modifiable', false, {})

	vim.fn['denops#request_async']('aioperator', 'start', {
		instruction,
		source,
		opts.openai or {},
		responseWriterId,
	}, finally, function(e)
		vim.notify(e.message, vim.log.levels.ERROR, { title = e.proto })
		finally()
	end)
end

return { opfunc = _G._aioperator_opfunc }
