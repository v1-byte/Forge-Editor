const MAX_TEXT_BYTES = 12 * 1024 * 1024;
const GGUF_HEADER_LIMIT = 64 * 1024 * 1024;
const BINARY_SAVE_BLOB_LIMIT = 128 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: false });
const encoder = new TextEncoder();

function safeCount(value, label, max = 2_000_000) {
	const n = Number(value);
	if (!Number.isSafeInteger(n) || n < 0 || n > max) throw new Error(`Invalid ${label} count`);
	return n;
}

function makeCursor(bytes) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let pos = 0;
	const need = n => {
		if (pos + n > bytes.length) throw new Error('GGUF header is incomplete or exceeds the 64 MiB inspection limit');
	};
	const u8 = () => { need(1); return view.getUint8(pos++); };
	const i8 = () => { need(1); return view.getInt8(pos++); };
	const u16 = () => { need(2); const v = view.getUint16(pos, true); pos += 2; return v; };
	const i16 = () => { need(2); const v = view.getInt16(pos, true); pos += 2; return v; };
	const u32 = () => { need(4); const v = view.getUint32(pos, true); pos += 4; return v; };
	const i32 = () => { need(4); const v = view.getInt32(pos, true); pos += 4; return v; };
	const f32 = () => { need(4); const v = view.getFloat32(pos, true); pos += 4; return v; };
	const u64 = () => { need(8); const v = view.getBigUint64(pos, true); pos += 8; return v; };
	const i64 = () => { need(8); const v = view.getBigInt64(pos, true); pos += 8; return v; };
	const f64 = () => { need(8); const v = view.getFloat64(pos, true); pos += 8; return v; };
	const str = () => {
		const nBig = u64();
		if (nBig > 16_777_216n) throw new Error('GGUF string exceeds the safe inspection limit');
		const n = Number(nBig); need(n);
		const value = decoder.decode(bytes.subarray(pos, pos + n)); pos += n;
		return value;
	};
	const skip = n => { need(n); pos += n; };
	return { bytes, get pos() { return pos; }, set pos(v) { pos = v; }, u8, i8, u16, i16, u32, i32, f32, u64, i64, f64, str, skip };
}

const VALUE_READERS = {
	0: c => c.u8(), 1: c => c.i8(), 2: c => c.u16(), 3: c => c.i16(),
	4: c => c.u32(), 5: c => c.i32(), 6: c => c.f32(), 7: c => c.u8() !== 0,
	8: c => c.str(), 10: c => c.u64(), 11: c => c.i64(), 12: c => c.f64()
};
const TYPE_NAMES = ['uint8', 'int8', 'uint16', 'int16', 'uint32', 'int32', 'float32', 'bool', 'string', 'array', 'uint64', 'int64', 'float64'];
const EDITABLE_METADATA_KEYS = new Set(['general.name', 'general.author', 'general.description', 'general.basename', 'general.finetune', 'general.license', 'general.url', 'general.organization', 'general.repo_url']);

function readValue(cursor, type, depth = 0) {
	if (depth > 2) throw new Error('Nested GGUF arrays are unsupported');
	if (type !== 9) {
		const read = VALUE_READERS[type];
		if (!read) throw new Error(`Unsupported GGUF value type ${type}`);
		return read(cursor);
	}
	const elementType = cursor.u32();
	const count = safeCount(cursor.u64(), 'array', 2_000_000);
	const read = VALUE_READERS[elementType];
	if (!read) throw new Error(`Unsupported GGUF array value type ${elementType}`);
	for (let i = 0; i < count; i++) read(cursor);
	return { array: true, elementType, count };
}

export function parseGgufBuffer(buffer, fileName = 'model.gguf') {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	const c = makeCursor(bytes);
	if (bytes.length < 24 || decoder.decode(bytes.subarray(0, 4)) !== 'GGUF') throw new Error('Selected file is not a GGUF file');
	c.pos = 4;
	const version = c.u32();
	if (version < 2 || version > 3) throw new Error(`GGUF version ${version} is not supported by this inspector (supported: v2-v3)`);
	const tensorCount = safeCount(c.u64(), 'tensor', 2_000_000);
	const metadataCount = safeCount(c.u64(), 'metadata', 2_000_000);
	const metadata = [];
	for (let i = 0; i < metadataCount; i++) {
		const key = c.str();
		const type = c.u32();
		const rawStart = c.pos;
		const value = readValue(c, type);
		metadata.push({ key, type, value, raw: bytes.slice(rawStart, c.pos) });
	}
	const tensors = [];
	for (let i = 0; i < tensorCount; i++) {
		const name = c.str();
		const nDims = safeCount(c.u32(), 'tensor dimension', 8);
		const dimensions = [];
		for (let d = 0; d < nDims; d++) dimensions.push(c.u64());
		const type = c.u32();
		const offset = c.u64();
		tensors.push({ name, dimensions, type, offset });
	}
	const alignEntry = metadata.find(x => x.key === 'general.alignment');
	const alignment = Number(alignEntry?.value ?? 32);
	if (!Number.isSafeInteger(alignment) || alignment < 1 || alignment > 4096) throw new Error('Invalid GGUF tensor alignment value');
	const dataStart = Math.ceil(c.pos / alignment) * alignment;
	if (dataStart > bytes.length) throw new Error('GGUF tensor header is incomplete; increase the header inspection limit');
	return { fileName, version, tensorCount, metadataCount, metadata, tensors, alignment, dataStart, headerLength: c.pos };
}

class ByteWriter {
	constructor() { this.parts = []; this.length = 0; }
	add(bytes) { const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); this.parts.push(b); this.length += b.length; }
	numeric(size, setter) { const b = new Uint8Array(size); setter(new DataView(b.buffer)); this.add(b); }
	u8(v) { this.numeric(1, d => d.setUint8(0, v)); }
	u16(v) { this.numeric(2, d => d.setUint16(0, v, true)); }
	u32(v) { this.numeric(4, d => d.setUint32(0, v, true)); }
	u64(v) { this.numeric(8, d => d.setBigUint64(0, BigInt(v), true)); }
	i8(v) { this.numeric(1, d => d.setInt8(0, v)); }
	i16(v) { this.numeric(2, d => d.setInt16(0, v, true)); }
	i32(v) { this.numeric(4, d => d.setInt32(0, v, true)); }
	i64(v) { this.numeric(8, d => d.setBigInt64(0, BigInt(v), true)); }
	f32(v) { this.numeric(4, d => d.setFloat32(0, v, true)); }
	f64(v) { this.numeric(8, d => d.setFloat64(0, v, true)); }
	str(v) { const b = encoder.encode(v); this.u64(b.length); this.add(b); }
	finish() { const out = new Uint8Array(this.length); let p = 0; for (const b of this.parts) { out.set(b, p); p += b.length; } return out; }
}

function encodeScalar(writer, type, value) {
	const number = Number(value);
	if (type === 8) { writer.str(String(value)); return; }
	if (type === 7) { if (typeof value !== 'boolean') throw new Error('Boolean value required'); writer.u8(value ? 1 : 0); return; }
	if (type === 0) { if (!Number.isInteger(number) || number < 0 || number > 255) throw new Error('Value must be between 0 and 255'); writer.u8(number); return; }
	if (type === 1) { if (!Number.isInteger(number) || number < -128 || number > 127) throw new Error('Value must be between -128 and 127'); writer.i8(number); return; }
	if (type === 2) { if (!Number.isInteger(number) || number < 0 || number > 65535) throw new Error('Value must be between 0 and 65535'); writer.u16(number); return; }
	if (type === 3) { if (!Number.isInteger(number) || number < -32768 || number > 32767) throw new Error('Value must be between -32768 and 32767'); writer.i16(number); return; }
	if (type === 4) { if (!Number.isInteger(number) || number < 0 || number > 0xffffffff) throw new Error('Value must be a valid uint32'); writer.u32(number); return; }
	if (type === 5) { if (!Number.isInteger(number) || number < -0x80000000 || number > 0x7fffffff) throw new Error('Value must be a valid int32'); writer.i32(number); return; }
	if (type === 6) { if (!Number.isFinite(number)) throw new Error('Value must be a finite number'); writer.f32(number); return; }
	if (type === 10) { const n = BigInt(String(value)); if (n < 0n || n > 0xffffffffffffffffn) throw new Error('Value must be a valid uint64'); writer.u64(n); return; }
	if (type === 11) { const n = BigInt(String(value)); if (n < -0x8000000000000000n || n > 0x7fffffffffffffffn) throw new Error('Value must be a valid int64'); writer.i64(n); return; }
	if (type === 12) { if (!Number.isFinite(number)) throw new Error('Value must be a finite number'); writer.f64(number); return; }
	throw new Error(`Metadata type ${TYPE_NAMES[type] || type} is read-only`);
}

function encodeGgufHeader(gguf, edits) {
	const w = new ByteWriter();
	w.add(encoder.encode('GGUF'));
	w.u32(gguf.version); w.u64(gguf.tensorCount); w.u64(gguf.metadataCount);
	for (const item of gguf.metadata) {
		w.str(item.key); w.u32(item.type);
		if (edits.has(item.key)) {
			if (!EDITABLE_METADATA_KEYS.has(item.key) || item.type !== 8) throw new Error(`Metadata key ${item.key} is read-only`);
			encodeScalar(w, item.type, edits.get(item.key));
		}
		else w.add(item.raw);
	}
	for (const tensor of gguf.tensors) {
		w.str(tensor.name); w.u32(tensor.dimensions.length);
		for (const dim of tensor.dimensions) w.u64(dim);
		w.u32(tensor.type); w.u64(tensor.offset);
	}
	return w.finish();
}

export function serializeGgufHeader(gguf, edits = new Map()) {
	const first = encodeGgufHeader(gguf, edits, 0n);
	const dataStart = Math.ceil(first.length / gguf.alignment) * gguf.alignment;
	const header = encodeGgufHeader(gguf, edits);
	return { header, dataStart, oldDataStart: gguf.dataStart };
}

function displayValue(value) {
	if (value && value.array) return `Array(${value.count}) · ${TYPE_NAMES[value.elementType] || value.elementType}`;
	if (typeof value === 'bigint') return value.toString();
	return String(value);
}

function fmtBytes(n) {
	if (!Number.isFinite(n)) return '—';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let v = n, i = 0;
	while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
	return `${v.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function el(tag, attrs = {}, children = []) {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(attrs)) {
		if (key === 'class') node.className = value;
		else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
		else if (value !== undefined && value !== null) node.setAttribute(key, String(value));
	}
	for (const child of Array.isArray(children) ? children : [children]) {
		if (child instanceof Node) node.append(child);
		else if (child !== null && child !== undefined) node.append(document.createTextNode(String(child)));
	}
	return node;
}

if (typeof document !== 'undefined') {
const state = {
	rootHandle: null, rootName: '', files: new Map(), docs: new Map(), tabs: [], current: '',
	selectedFile: null, gguf: null, metadataEdits: new Map(), hexOffset: 0, hexPatch: null,
	models: [], routerModels: [], selectedModel: '', selectedCopilotModel: '', apiKey: '', chat: [], search: '', activeView: 'explorer', activePanel: 'inspect',
	formatOnSave: false, busy: false, abort: null, watchingModelProgress: false, modelProgressReady: null
};

const $ = selector => document.querySelector(selector);
const ui = {
	tree: $('#fileTree'), tabs: $('#tabs'), editor: $('#editor'), empty: $('#emptyEditor'),
	path: $('#currentPath'), dirty: $('#dirtyState'), status: $('#statusText'), apiDot: $('#apiDot'),
	apiText: $('#apiText'), terminal: $('#terminalLog'),
	search: $('#workspaceSearch'), modelSelect: $('#modelSelect'), copilotModelSelect: $('#copilotModelSelect'),
	copilotModelStatus: $('#copilotModelStatus'), loadCopilotModel: $('#loadCopilotModel'), lab: $('#labMessages'),
	labInput: $('#labInput'), copilotInput: $('#copilotInput'), copilotMessages: $('#copilotMessages'),
	modal: $('#settingsDialog'), toastRoot: $('#toasts'),
};

function toast(message, kind = 'info') {
	const item = el('div', { class: `toast ${kind}` }, message);
	ui.toastRoot.append(item);
	setTimeout(() => item.remove(), 4000);
}
function log(message) {
	const row = el('div', { class: 'log-line' }, `${new Date().toLocaleTimeString()}  ${message}`);
	ui.terminal.append(row); ui.terminal.scrollTop = ui.terminal.scrollHeight;
}
function setBusy(busy, text = '') {
	state.busy = busy;
	ui.status.textContent = text || (busy ? 'Working…' : 'Ready');
	renderCopilotModelSelect();
}
function headers(json = false) {
	const h = {};
	if (json) h['Content-Type'] = 'application/json';
	if (state.apiKey.trim()) h.Authorization = `Bearer ${state.apiKey.trim()}`;
	return h;
}

async function refreshServerStatus() {
	ui.apiText.textContent = 'Checking server…'; ui.apiDot.className = 'dot checking';
	try {
		const [health, models] = await Promise.all([
			fetch('/health', { headers: headers() }),
			fetch('/v1/models', { headers: headers() })
		]);
		if (!health.ok) throw new Error(`health HTTP ${health.status}`);
		const healthData = await health.json();
		if (!models.ok) throw new Error(`models HTTP ${models.status}`);
			const body = await models.json();
			state.models = Array.isArray(body.data) ? body.data : [];
			if (!state.selectedModel && state.models.length) state.selectedModel = state.models[0].id || state.models[0].model || '';
			await refreshRouterModels();
			ui.apiDot.className = 'dot online';
			ui.apiText.textContent = state.models.length ? `Server online · ${state.models.length} model(s)` : 'Server online · no models listed';
			$('#apiDetails').textContent = `GET /health: ${healthData.status || 'ok'}\nGET /v1/models: ${state.models.length} model(s)`;
			renderModelSelect(); renderCopilotModelSelect(); renderModelSummary(healthData);
			log(`Connected to API; ${state.models.length} model(s) reported.`);
		} catch (error) {
			state.models = []; state.routerModels = [];
			ui.apiDot.className = 'dot offline'; ui.apiText.textContent = `Server unavailable · ${error.message}`;
			$('#apiDetails').textContent = `Server unavailable: ${error.message}`;
			renderModelSelect(); renderCopilotModelSelect(); renderModelSummary(null); log(`API unavailable: ${error.message}`);
		}
	}
function renderModelSelect() {
	ui.modelSelect.replaceChildren();
	if (!state.models.length) {
		ui.modelSelect.append(el('option', { value: '' }, 'No models reported by server'));
		state.selectedModel = '';
		return;
	}
	for (const model of state.models) {
		const id = model.id || model.model;
		const option = el('option', { value: id }, id);
		if (id === state.selectedModel) option.selected = true;
			ui.modelSelect.append(option);
		}
	}
	function routerStatus(model) {
		return typeof model?.status === 'string' ? model.status : model?.status?.value || '';
	}
	function renderCopilotModelSelect() {
		if (!ui.copilotModelSelect) return;
		const entries = new Map();
		for (const model of state.routerModels) {
			const id = model.id || model.model;
			if (id) entries.set(id, model);
		}
		for (const model of state.models) {
			const id = model.id || model.model;
			if (id && !entries.has(id)) entries.set(id, { ...model, status: { value: 'loaded' } });
		}
		const rank = { loaded: 0, sleeping: 1, downloaded: 2, unloaded: 2, loading: 3, failed: 4, downloading: 5, incomplete: 6, download_failed: 7 };
		const options = [...entries.values()].sort((a, b) => (rank[routerStatus(a)] ?? 8) - (rank[routerStatus(b)] ?? 8));
		ui.copilotModelSelect.replaceChildren();
		if (!options.length) {
			ui.copilotModelSelect.append(el('option', { value: '' }, 'No models reported by server'));
			state.selectedCopilotModel = '';
		} else {
			const usable = options.filter(model => !['downloading', 'incomplete', 'download_failed'].includes(routerStatus(model)));
			const current = options.some(model => (model.id || model.model) === state.selectedCopilotModel)
				? state.selectedCopilotModel
				: (usable.find(model => (model.id || model.model) === state.selectedModel)?.id || usable[0]?.id || '');
			state.selectedCopilotModel = current;
			for (const model of options) {
				const id = model.id || model.model;
				const status = routerStatus(model);
				const label = status ? ` · ${status.replaceAll('_', ' ')}` : '';
				const option = el('option', { value: id }, `${id}${label}`);
				option.disabled = ['downloading', 'incomplete', 'download_failed'].includes(status);
				if (id === current) option.selected = true;
				ui.copilotModelSelect.append(option);
			}
		}
		const selected = options.find(model => (model.id || model.model) === state.selectedCopilotModel);
		const status = routerStatus(selected);
		const loaded = state.models.some(model => (model.id || model.model) === state.selectedCopilotModel) || ['loaded', 'sleeping'].includes(status);
		const routerModel = state.routerModels.find(model => (model.id || model.model) === state.selectedCopilotModel);
		ui.loadCopilotModel.hidden = !routerModel;
		ui.loadCopilotModel.disabled = state.busy || !routerModel || loaded || ['loading', 'downloading', 'incomplete', 'download_failed'].includes(status);
		ui.loadCopilotModel.textContent = loaded ? 'Model ready' : status === 'loading' ? 'Loading model…' : 'Load selected model';
		ui.copilotModelStatus.textContent = !state.selectedCopilotModel
			? 'No model is available. Start llama-server or download one in Router mode.'
			: loaded ? `Copilot will use ${state.selectedCopilotModel} on the local inference server.`
			: status === 'downloading' ? `${state.selectedCopilotModel} is still downloading.`
			: status === 'incomplete' ? `${state.selectedCopilotModel} has an incomplete download; resume it from Router mode.`
			: `${state.selectedCopilotModel} is available in the Router cache and must be loaded before inference.`;
	}
	async function refreshRouterModels() {
		try {
			const response = await fetch('/models', { headers: headers() });
			if (!response.ok) { state.routerModels = []; renderCopilotModelSelect(); return false; }
			const body = await response.json();
			state.routerModels = Array.isArray(body.data) ? body.data : [];
			renderCopilotModelSelect();
			return true;
		} catch {
			state.routerModels = [];
			renderCopilotModelSelect();
			return false;
		}
	}
	function renderModelSummary(health) {
		const panel = $('#apiSummary'); panel.replaceChildren();
	panel.append(el('div', { class: 'info-line' }, `Liveness: ${health?.status || 'Unavailable'}`));
	panel.append(el('div', { class: 'info-line' }, `Models: ${state.models.length}`));
	for (const model of state.models) {
		const name = model.id || model.model || 'Unknown model';
		panel.append(el('div', { class: 'model-card' }, [
			el('b', {}, name), el('span', {}, model.status || model.state || 'Reported by /v1/models'),
			el('span', {}, model.context_length ? `Context ${model.context_length}` : '')
		]));
	}
	if (!state.models.length) panel.append(el('p', { class: 'muted' }, 'The server is reachable, but it did not report a model. A running server does not prove a model is loaded.'));
}

function renderTree() {
	ui.tree.replaceChildren();
	if (!state.files.size) {
		ui.tree.append(el('div', { class: 'empty-note' }, 'Open a local folder or choose files. The browser will only access files you explicitly select.'));
		return;
	}
	const q = state.search.trim().toLowerCase();
	const entries = [...state.files.keys()].sort((a, b) => a.localeCompare(b));
	for (const path of entries) {
		if (q && !path.toLowerCase().includes(q)) continue;
		const isCurrent = path === state.current;
		const row = el('button', { class: `tree-file ${isCurrent ? 'selected' : ''}`, 'data-open-path': path, title: path }, [
			el('span', { class: 'file-icon' }, iconFor(path)),
			el('span', { class: 'tree-name' }, path),
			state.docs.get(path)?.dirty ? el('span', { class: 'dirty-dot' }, '●') : null
		]);
		ui.tree.append(row);
	}
}
function iconFor(path) { const ext = path.split('.').pop().toLowerCase(); return ({ gguf: '◆', cpp: 'C++', h: 'H', hpp: 'H', py: 'Py', md: 'MD', json: '{}', txt: 'T' })[ext] || '·'; }
function renderTabs() {
	ui.tabs.replaceChildren();
	for (const path of state.tabs) {
		const doc = state.docs.get(path);
		const tab = el('button', { class: `tab ${path === state.current ? 'active' : ''}`, 'data-tab-path': path, title: path }, [
			el('span', {}, iconFor(path)), el('span', { class: 'tab-name' }, path.split('/').pop()),
			doc?.dirty ? el('span', { class: 'dirty-dot' }, '●') : null,
			el('span', { class: 'tab-close', 'data-close-path': path, title: 'Close tab' }, '×')
		]);
		ui.tabs.append(tab);
	}
}
function renderEditor() {
	const doc = state.docs.get(state.current);
	const ready = !!doc && !doc.binary;
	$('#lineNumbers').textContent = ready ? Array.from({ length: doc.text.split('\n').length }, (_, i) => i + 1).join('\n') : '1';
	ui.editor.hidden = !ready; ui.empty.hidden = ready;
	if (ready) {
		if (ui.editor.value !== doc.text) ui.editor.value = doc.text;
		ui.editor.disabled = false;
	} else if (doc?.binary) {
		ui.empty.textContent = 'Binary file selected. Use the Hex panel to inspect bytes or choose a text file to edit.';
	} else {
		ui.empty.textContent = 'Open a folder or file to begin. No placeholder file content is shown.';
	}
	ui.path.textContent = state.current || 'No file selected';
	ui.dirty.textContent = doc?.dirty ? 'Unsaved changes' : (ready ? 'Saved' : 'Ready');
	ui.dirty.className = doc?.dirty ? 'dirty-state dirty' : 'dirty-state';
	renderTabs(); renderTree();
}

async function permission(handle, mode = 'read') {
	if (!handle?.queryPermission) return true;
	let p = await handle.queryPermission({ mode });
	if (p !== 'granted' && handle.requestPermission) p = await handle.requestPermission({ mode });
	if (p !== 'granted') throw new Error(`${mode} permission was not granted`);
	return true;
}
async function scanDirectory(handle, prefix = '', depth = 0, cap = { n: 0 }) {
	if (depth > 8 || cap.n > 2500) return;
	for await (const [name, child] of handle.entries()) {
		const path = prefix ? `${prefix}/${name}` : name;
		if (child.kind === 'directory') {
			await scanDirectory(child, path, depth + 1, cap);
		} else {
			state.files.set(path, child); cap.n++;
		}
		if (cap.n > 2500) break;
	}
}
async function openFolder() {
	if (!window.showDirectoryPicker) { $('#fileFallback').click(); return; }
	try {
		const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
		await permission(handle, 'readwrite');
		state.rootHandle = handle; state.rootName = handle.name; state.files.clear(); state.docs.clear(); state.tabs = []; state.current = ''; state.selectedFile = null; state.gguf = null; state.metadataEdits.clear(); state.hexPatch = null;
		$('#selectedModelFile').textContent = 'No local model file selected.'; renderGgufControls(); renderGguf();
		await scanDirectory(handle);
		$('#workspaceName').textContent = handle.name;
		renderTree(); toast(`Opened ${state.files.size} file(s) from ${handle.name}`); log(`Workspace opened: ${handle.name}`);
	} catch (error) { if (error.name !== 'AbortError') toast(`Folder open failed: ${error.message}`, 'error'); }
}
async function openPickedFiles(fileList) {
	for (const file of fileList) {
		const path = file.webkitRelativePath || file.name;
		state.files.set(path, null); state.docs.set(path, { file, handle: null, text: '', dirty: false, binary: isBinaryFile(file) });
	}
	const first = fileList[0];
	if (first) await openFilePath(first.webkitRelativePath || first.name);
	$('#workspaceName').textContent = 'Selected files'; renderTree();
}
function isBinaryFile(file) {
	const ext = file.name.split('.').pop().toLowerCase();
	return ['gguf', 'bin', 'ggml', 'model', 'safetensors'].includes(ext) || file.size > MAX_TEXT_BYTES;
}
async function openFilePath(path) {
	const handle = state.files.get(path);
	if (!state.tabs.includes(path)) state.tabs.push(path);
	state.current = path;
	let doc = state.docs.get(path);
	try {
		const file = handle?.getFile ? await handle.getFile() : doc?.file;
		if (!file) throw new Error('The file is no longer available; reopen the folder.');
		const binary = isBinaryFile(file);
		if (state.selectedFile !== file) state.hexPatch = null;
		if (!file.name.toLowerCase().endsWith('.gguf')) { state.gguf = null; state.metadataEdits.clear(); $('#selectedModelFile').textContent = 'Selected file is not GGUF.'; }
		state.selectedFile = file;
		if (binary) {
			doc = { file, handle: handle || null, text: '', dirty: false, binary: true };
			if (file.name.toLowerCase().endsWith('.gguf')) await inspectGguf(file);
			else { state.gguf = null; state.metadataEdits.clear(); $('#selectedModelFile').textContent = file.name.endsWith('.gguf') ? `${file.name} · ${fmtBytes(file.size)}` : 'Selected file is not GGUF.'; renderGguf(); }
		} else if (!doc || doc.file !== file) {
			if (file.size > MAX_TEXT_BYTES) throw new Error(`Text file is larger than ${fmtBytes(MAX_TEXT_BYTES)}; open read-only is limited.`);
			const text = await file.text();
			doc = { file, handle: handle || null, text, dirty: false, binary: false };
			state.selectedFile = file;
		}
		if (doc) { doc.handle = handle || doc.handle; doc.file = file; state.docs.set(path, doc); }
		renderEditor(); renderGgufControls();
	} catch (error) {
		state.tabs = state.tabs.filter(x => x !== path); state.current = '';
		renderEditor(); toast(`Cannot open ${path}: ${error.message}`, 'error');
	}
}
async function newFile() {
	if (!state.rootHandle) { toast('Open a folder first to create a real file.', 'warn'); return; }
	const name = prompt('New file name (relative to workspace root):', 'new_file.txt');
	if (!name) return;
	if (name.includes('..') || name.startsWith('/') || name.includes('\\')) { toast('Use a simple relative filename; path traversal is not allowed.', 'error'); return; }
	try {
		const handle = await state.rootHandle.getFileHandle(name, { create: true });
		const writable = await handle.createWritable(); await writable.write(''); await writable.close();
		state.files.set(name, handle); state.docs.set(name, { file: await handle.getFile(), handle, text: '', dirty: false, binary: false });
		await openFilePath(name); toast(`Created ${name}`, 'success');
	} catch (error) { toast(`Create failed: ${error.message}`, 'error'); }
}
async function saveCurrent() {
	const doc = state.docs.get(state.current);
	if (!doc || doc.binary) { toast('Select a text file before saving.', 'warn'); return; }
	if (!doc.dirty) { toast('No unsaved changes.'); return; }
	try {
		if (doc.handle?.createWritable) {
			await permission(doc.handle, 'readwrite');
			if (state.formatOnSave) doc.text = doc.text.split('\n').map(line => line.replace(/[\t ]+$/g, '')).join('\n');
		const writable = await doc.handle.createWritable(); await writable.write(doc.text); await writable.close();
			doc.file = await doc.handle.getFile();
		} else {
			if (state.formatOnSave) doc.text = doc.text.split('\n').map(line => line.replace(/[\t ]+$/g, '')).join('\n');
			downloadBlob(new Blob([doc.text], { type: 'text/plain;charset=utf-8' }), state.current.split('/').pop());
		}
		doc.dirty = false; renderEditor(); toast(`Saved ${state.current}`, 'success'); log(`Saved ${state.current}`);
	} catch (error) { toast(`Save failed; changes remain unsaved: ${error.message}`, 'error'); }
}
async function reloadCurrent() {
	const doc = state.docs.get(state.current);
	if (!doc?.handle) { toast('Reload requires a folder/file handle. Reopen the file to read the selected copy.', 'warn'); return; }
	if (doc.dirty && !confirm('Discard unsaved changes and reload the file from disk?')) return;
	try {
		const file = await doc.handle.getFile();
		doc.file = file; doc.text = await file.text(); doc.dirty = false; renderEditor(); toast('Reloaded from the selected local file.', 'success');
	} catch (error) { toast(`Reload failed: ${error.message}`, 'error'); }
}
function downloadBlob(blob, name) {
	const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
}
async function closeTab(path) {
	const doc = state.docs.get(path);
	if (doc?.dirty && !confirm(`${path} has unsaved changes. Close it anyway?`)) return;
	state.tabs = state.tabs.filter(x => x !== path);
	if (state.current === path) state.current = state.tabs.at(-1) || '';
	renderEditor();
}
function editText() {
	const doc = state.docs.get(state.current);
	if (!doc || doc.binary) return;
	doc.text = ui.editor.value; doc.dirty = true; renderEditor();
}

function renderGguf() {
	const meta = $('#metadataRows'), tensors = $('#tensorRows');
	meta.replaceChildren(); tensors.replaceChildren();
	if (!state.gguf) {
		meta.append(el('p', { class: 'muted' }, 'Choose a .gguf file with Import/Open to inspect real metadata. No sample tensors are shown.'));
		tensors.append(el('p', { class: 'muted' }, 'No GGUF file selected.'));
		$('#ggufSummary').textContent = 'No GGUF loaded'; return;
	}
	const g = state.gguf;
	$('#ggufSummary').textContent = `${g.fileName} · GGUF v${g.version} · ${g.tensorCount.toLocaleString()} tensor(s) · ${g.metadataCount.toLocaleString()} metadata entries`;
	for (const item of g.metadata) {
		const row = el('div', { class: 'metadata-row' });
		row.append(el('code', {}, item.key));
		if (item.type === 8 && EDITABLE_METADATA_KEYS.has(item.key)) {
			const input = el('input', { class: 'meta-input', value: displayValue(state.metadataEdits.get(item.key) ?? item.value), 'aria-label': `Value for ${item.key}` });
			input.addEventListener('change', () => {
				try { encodeScalar(new ByteWriter(), item.type, input.value); state.metadataEdits.set(item.key, input.value); $('#saveMetadata').disabled = false; $('#metadataNotice').textContent = `${state.metadataEdits.size} unsaved metadata edit(s). Saving creates a separate file; the source stays unchanged.`; }
				catch (error) { input.value = displayValue(item.value); toast(`${item.key}: ${error.message}`, 'error'); }
			});
			row.append(input);
		} else {
			row.append(el('span', { class: 'meta-value' }, displayValue(item.value)));
		}
		row.append(el('small', {}, TYPE_NAMES[item.type] || `type ${item.type}`)); meta.append(row);
	}
	for (const tensor of g.tensors.slice(0, 5000)) {
		const dims = tensor.dimensions.map(String).join(' × ');
		tensors.append(el('div', { class: 'tensor-row' }, [el('b', {}, tensor.name), el('span', {}, dims), el('small', {}, `type ${tensor.type} · offset ${tensor.offset}`)]));
	}
	if (g.tensorCount > 5000) tensors.append(el('p', { class: 'muted' }, `Showing first 5,000 of ${g.tensorCount.toLocaleString()} tensors.`));
	$('#saveMetadata').disabled = state.metadataEdits.size === 0;
	$('#metadataNotice').textContent = state.metadataEdits.size ? `${state.metadataEdits.size} unsaved metadata edit(s). Saving creates a separate file; the source stays unchanged.` : 'Read-only until you edit a supported scalar value.';
}
async function inspectGguf(file) {
	try {
		state.selectedFile = file;
		$('#selectedModelFile').textContent = `${file.name} · ${fmtBytes(file.size)}`;
		if (!file.name.toLowerCase().endsWith('.gguf')) throw new Error('Choose a .gguf file.');
		if (file.size < 24) throw new Error('File is too small to contain a GGUF header.');
		const buffer = await file.slice(0, Math.min(file.size, GGUF_HEADER_LIMIT)).arrayBuffer();
		state.gguf = parseGgufBuffer(buffer, file.name); state.selectedFile = file; state.metadataEdits.clear(); state.hexOffset = 0; state.hexPatch = null;
		$('#selectedModelFile').textContent = `${file.name} · ${fmtBytes(file.size)}`;
		renderGguf(); renderHex(); renderGgufControls();
		log(`Inspected ${file.name}: GGUF v${state.gguf.version}, ${state.gguf.tensorCount} tensors.`);
	} catch (error) { state.gguf = null; renderGguf(); renderGgufControls(); toast(`GGUF inspection failed: ${error.message}`, 'error'); }
}
function renderGgufControls() {
	$('#exportCopy').disabled = !state.selectedFile;
	if ($('#openHex')) $('#openHex').disabled = !state.selectedFile;
	$('#quantizeInput').textContent = state.selectedFile?.name || 'No input GGUF selected';
}
async function saveMetadataCopy() {
	if (!state.gguf || !state.selectedFile || !state.metadataEdits.size) return;
	try {
		const { header, dataStart, oldDataStart } = serializeGgufHeader(state.gguf, state.metadataEdits);
		const name = state.selectedFile.name.replace(/\.gguf$/i, '') + '-edited.gguf';
		if (window.showSaveFilePicker) {
			const handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'GGUF model', accept: { 'application/octet-stream': ['.gguf'] } }] });
			const writable = await handle.createWritable();
			await writable.write(header);
			if (dataStart > header.length) await writable.write(new Uint8Array(dataStart - header.length));
			await copyFileRange(state.selectedFile, oldDataStart, state.selectedFile.size, writable);
			await writable.close();
		} else {
			if (state.selectedFile.size > BINARY_SAVE_BLOB_LIMIT) throw new Error('This browser cannot safely export a large model. Use Chromium with Save As support.');
			const tail = await state.selectedFile.slice(oldDataStart).arrayBuffer();
			const padding = new Uint8Array(dataStart - header.length);
			downloadBlob(new Blob([header, padding, tail], { type: 'application/octet-stream' }), name);
		}
		renderGguf(); toast('Edited GGUF copy saved; original file was not changed. The source and edit draft remain open.', 'success');
	} catch (error) { if (error.name !== 'AbortError') toast(`Metadata export failed: ${error.message}`, 'error'); }
}
async function copyFileRange(file, start, end, writable, patch = null) {
	const chunkSize = 4 * 1024 * 1024;
	for (let offset = start; offset < end; offset += chunkSize) {
		const bytes = new Uint8Array(await file.slice(offset, Math.min(offset + chunkSize, end)).arrayBuffer());
		if (patch) for (const [index, value] of patch) if (index >= offset && index < offset + bytes.length) bytes[index - offset] = value;
		await writable.write(bytes);
	}
}
function renderHex() {
	const pane = $('#hexRows'); pane.replaceChildren();
	if (!state.selectedFile) { pane.append(el('p', { class: 'muted' }, 'Open a local file to view bytes.')); return; }
	const file = state.selectedFile, start = state.hexOffset, length = 256;
	pane.append(el('p', { class: 'muted' }, `${file.name} · ${fmtBytes(file.size)} · offset 0x${start.toString(16)}`));
	file.slice(start, Math.min(start + length, file.size)).arrayBuffer().then(buffer => {
		const bytes = new Uint8Array(buffer);
		for (let i = 0; i < bytes.length; i += 16) {
			const row = bytes.subarray(i, i + 16), off = start + i;
			const value = [...row].map((b, j) => {
				const index = off + j;
				return `<button class="hex-byte ${state.hexPatch?.has(index) ? 'edited' : ''}" data-byte-index="${index}" title="Edit byte at 0x${index.toString(16)}">${(state.hexPatch?.get(index) ?? b).toString(16).padStart(2,'0')}</button>`;
			}).join(' ');
			const ascii = [...row].map((b, j) => { const n = state.hexPatch?.get(off + j) ?? b; return n >= 32 && n < 127 ? String.fromCharCode(n) : '.'; }).join('');
			const line = el('div', { class: 'hex-line' });
			line.append(el('code', {}, off.toString(16).padStart(8, '0')));
			const hex = el('span', { class: 'hex-values' }); hex.innerHTML = value; // only generated hex values and numeric indices are inserted
			line.append(hex, el('code', { class: 'ascii' }, ascii)); pane.append(line);
		}
	}).catch(error => pane.append(el('p', { class: 'error' }, error.message)));
}
async function saveHexCopy() {
	if (!state.selectedFile || !state.hexPatch?.size) { toast('Edit at least one byte first.', 'warn'); return; }
	const file = state.selectedFile, name = file.name.replace(/(\.[^.]+)?$/, '-edited$1');
	try {
		if (window.showSaveFilePicker) {
			const handle = await window.showSaveFilePicker({ suggestedName: name });
			const writable = await handle.createWritable();
			await copyFileRange(file, 0, file.size, writable, state.hexPatch); await writable.close();
		} else {
			if (file.size > BINARY_SAVE_BLOB_LIMIT) throw new Error('Large-file Save As is unavailable in this browser.');
			const bytes = new Uint8Array(await file.arrayBuffer());
			for (const [index, value] of state.hexPatch) bytes[index] = value;
			downloadBlob(new Blob([bytes]), name);
		}
		renderHex(); toast('Edited binary copy saved; original was not changed. The source and patch draft remain open.', 'success');
	} catch (error) { if (error.name !== 'AbortError') toast(`Hex export failed: ${error.message}`, 'error'); }
}

function renderBinary() {
	const target = $('#binaryRows'); target.replaceChildren();
	if (!state.selectedFile) { target.textContent = 'Open a local file to view bits.'; return; }
	const file = state.selectedFile, start = state.hexOffset;
	target.textContent = `Reading ${file.name} at offset 0x${start.toString(16)}…`;
	file.slice(start, Math.min(start + 96, file.size)).arrayBuffer().then(buffer => {
		const bytes = new Uint8Array(buffer);
		target.textContent = [...bytes].map((value, i) => `${(start + i).toString(16).padStart(8, '0')}  ${value.toString(2).padStart(8, '0')}`).join('\n') || 'End of file';
	}).catch(error => { target.textContent = `Read error: ${error.message}`; });
}
function renderPanel(name) {
	state.activePanel = name;
	document.querySelectorAll('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== name);
	document.querySelectorAll('[data-right-tab]').forEach(b => b.classList.toggle('active', b.dataset.rightTab === name));
	if (name === 'hex') renderHex();
	if (name === 'binary') renderBinary();
	if (name === 'metadata' || name === 'inspect') renderGguf();
}
function renderSidebar(view = state.activeView) {
	state.activeView = view;
	document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
	$('#workspaceSection').hidden = !['explorer', 'search', 'git', 'extensions', 'neural'].includes(view);
	$('#neuralSection').hidden = view !== 'neural';
	$('#searchSection').hidden = view !== 'search';
	$('#gitSection').hidden = view !== 'git';
	$('#extensionsSection').hidden = view !== 'extensions';
	$('#explorerSection').hidden = view !== 'explorer';
	if (view === 'search') renderSearchResults();
}
function renderSearchResults() {
	const root = $('#searchResults'); root.replaceChildren();
	const q = ui.search.value.trim().toLowerCase();
	if (!q) { root.append(el('p', { class: 'muted' }, 'Search file paths and text in files already opened in the editor.')); return; }
	let count = 0;
	for (const [path, doc] of state.docs) {
		if (path.toLowerCase().includes(q)) { root.append(el('button', { class: 'search-result', 'data-open-path': path }, `${path} · path match`)); count++; }
		if (!doc.binary) {
			const lines = doc.text.split('\n');
			for (let i = 0; i < lines.length && count < 100; i++) if (lines[i].toLowerCase().includes(q)) {
				root.append(el('button', { class: 'search-result', 'data-open-path': path }, `${path}:${i + 1}  ${lines[i].trim().slice(0, 140)}`)); count++;
			}
		}
	}
	if (!count) root.append(el('p', { class: 'muted' }, 'No matches in opened files.'));
}

async function chatRequest(messages, onDelta = null, modelOverride = '') {
	if (!state.models.length) throw new Error('The server reports no available models. Check the API Server panel.');
	const model = modelOverride || state.selectedModel || state.models[0].id || state.models[0].model;
	const response = await fetch('/v1/chat/completions', {
		method: 'POST', headers: headers(true),
		body: JSON.stringify({ model, messages, stream: !!onDelta, temperature: 0.7 })
	});
	if (!response.ok) {
		const text = await response.text(); throw new Error(`Chat request failed (${response.status}): ${text.slice(0, 600)}`);
	}
	if (!onDelta) { const body = await response.json(); return body.choices?.[0]?.message?.content || ''; }
	if (!response.body) throw new Error('Streaming response body is unavailable.');
	const reader = response.body.getReader(), td = new TextDecoder(); let buffer = '', result = '';
	while (true) {
		const { value, done } = await reader.read(); if (done) break;
		buffer += td.decode(value, { stream: true });
		const lines = buffer.split('\n'); buffer = lines.pop() || '';
		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			const data = line.slice(5).trim(); if (data === '[DONE]') continue;
			try { const json = JSON.parse(data); const delta = json.choices?.[0]?.delta?.content || ''; if (delta) { result += delta; onDelta(delta); } }
			catch { /* ignore SSE comments and incomplete data lines */ }
		}
	}
	return result;
}

async function openRouterModelWatcher(modelId) {
	const controller = new AbortController();
	let closed = false, timedOut = false;
	const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 10 * 60 * 1000);
	let response;
	try { response = await fetch('/models/sse', { headers: headers(), signal: controller.signal }); }
	catch (error) { clearTimeout(timeout); if (timedOut) throw new Error('Timed out connecting to Router model events.'); throw error; }
	if (!response.ok || !response.body) { clearTimeout(timeout); throw new Error(`Router model event stream unavailable (HTTP ${response.status}).`); }
	const reader = response.body.getReader();
	const wait = (async () => {
		const decoder = new TextDecoder(); let buffer = '';
		while (true) {
			const { value, done } = await reader.read();
			if (done) throw new Error('Router model event stream closed before loading finished.');
			buffer += decoder.decode(value, { stream: true });
			const records = buffer.split(/\r?\n\r?\n/); buffer = records.pop() || '';
			for (const record of records) {
				const data = record.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
				if (!data) continue;
				let event;
				try { event = JSON.parse(data); } catch { continue; }
				if (event.model !== modelId) continue;
				const status = event.data?.status;
				if (['loaded', 'sleeping'].includes(status)) return status;
				if (['failed', 'download_failed'].includes(status)) throw new Error(`Router failed to load ${modelId}.`);
				if (event.event === 'model_remove') throw new Error(`${modelId} was removed from the Router cache.`);
			}
		}
	})().catch(error => {
		if (closed) return null;
		if (timedOut) throw new Error(`Timed out waiting for ${modelId} to load.`);
		throw error;
	});
	return {
		wait,
		close: () => { closed = true; clearTimeout(timeout); controller.abort(); void reader.cancel().catch(() => {}); }
	};
}

async function ensureCopilotModelLoaded(modelId) {
	if (!modelId) throw new Error('Select a model for Copilot first.');
	let routerModel = state.routerModels.find(model => (model.id || model.model) === modelId);
	const alreadyLoaded = () => state.models.some(model => (model.id || model.model) === modelId) || ['loaded', 'sleeping'].includes(routerStatus(routerModel));
	if (alreadyLoaded()) return;
	if (!routerModel) {
		if (!await refreshRouterModels()) throw new Error('This model is not available from the local server. Router mode is required to load cached models.');
		routerModel = state.routerModels.find(model => (model.id || model.model) === modelId);
	}
	if (!routerModel) throw new Error(`${modelId} is not listed in the Router cache. Download it from Hugging Face first.`);
	let status = routerStatus(routerModel);
	if (status === 'downloading' || status === 'incomplete' || status === 'download_failed') throw new Error(`${modelId} is not ready. Finish or resume its Hugging Face download first.`);
	const watcher = await openRouterModelWatcher(modelId);
	try {
		await refreshRouterModels();
		routerModel = state.routerModels.find(model => (model.id || model.model) === modelId);
		status = routerStatus(routerModel);
		if (alreadyLoaded()) return;
		if (!routerModel) throw new Error(`${modelId} is no longer listed in the Router cache.`);
		if (status !== 'loading') {
			const response = await fetch('/models/load', { method: 'POST', headers: headers(true), body: JSON.stringify({ model: modelId }) });
			const body = await response.json().catch(() => ({}));
			if (!response.ok || body.success === false) throw new Error(body.error?.message || `Load request failed (HTTP ${response.status}).`);
		}
		ui.status.textContent = `Loading ${modelId} on the local inference server…`;
		await watcher.wait;
		await refreshServerStatus();
		if (!state.models.some(model => (model.id || model.model) === modelId) && !['loaded', 'sleeping'].includes(routerStatus(state.routerModels.find(model => (model.id || model.model) === modelId)))) {
			throw new Error(`${modelId} did not become available through /v1/models.`);
		}
	} finally { watcher.close(); }
}

async function loadCopilotModel() {
	if (state.busy) return;
	const modelId = state.selectedCopilotModel;
	if (!modelId) { toast('Select a model for Copilot first.', 'warn'); return; }
	setBusy(true, `Loading ${modelId}…`);
	try { await ensureCopilotModelLoaded(modelId); toast(`${modelId} is ready for Copilot.`, 'success'); }
	catch (error) { toast(error.message, 'error'); log(`Copilot model load failed: ${error.message}`); }
	finally { setBusy(false); }
}

function renderMessages(root, list) {
	root.replaceChildren();
	for (const message of list) root.append(el('div', { class: `message ${message.role}` }, [el('b', {}, message.role === 'user' ? 'You' : 'Forge'), el('div', {}, message.content)]));
	root.scrollTop = root.scrollHeight;
}
async function sendLabMessage() {
	const promptText = ui.labInput.value.trim(); if (!promptText || state.busy) return;
	ui.labInput.value = '';
	const history = JSON.parse(sessionStorage.getItem('forge-lab-history') || '[]');
	history.push({ role: 'user', content: promptText });
	const assistant = { role: 'assistant', content: '' }; history.push(assistant); renderMessages(ui.lab, history);
	setBusy(true, 'Generating…'); state.abort = new AbortController();
	try {
		const messages = history.slice(-20).filter(m => m.content).map(({ role, content }) => ({ role, content }));
		await chatRequest(messages, delta => { assistant.content += delta; renderMessages(ui.lab, history); });
		sessionStorage.setItem('forge-lab-history', JSON.stringify(history.slice(-40)));
		log('Chat Lab response completed.');
	} catch (error) { assistant.content = `Error: ${error.message}`; renderMessages(ui.lab, history); toast(error.message, 'error'); }
	finally { setBusy(false); state.abort = null; }
}
async function sendCopilot(promptText) {
	const text = (promptText || ui.copilotInput.value).trim(); if (!text || state.busy) return;
	ui.copilotInput.value = '';
	const doc = state.docs.get(state.current);
	const messages = [
		{ role: 'system', content: 'You are Forge Editor Copilot. Be concise. If asked to edit code, return the complete replacement file in a single fenced code block and describe any assumptions. Never claim that a file was saved.' },
		{ role: 'user', content: `Request: ${text}\n\nCurrent file: ${state.current || '(none)'}\n\n${doc && !doc.binary ? doc.text.slice(0, 50000) : '(No text file is open)'}` }
	];
	const userRow = el('div', { class: 'message user' }, [el('b', {}, 'You'), el('div', {}, text)]);
	ui.copilotMessages.append(userRow);
	const output = el('div', { class: 'message assistant' }, [el('b', {}, 'Forge Copilot'), el('div', { class: 'copilot-output' }, 'Working…')]);
	ui.copilotMessages.append(output); const content = output.querySelector('.copilot-output');
		const modelId = state.selectedCopilotModel || state.selectedModel;
		setBusy(true, `Copilot is preparing ${modelId || 'the selected model'}…`);
		try {
			await ensureCopilotModelLoaded(modelId);
			const answer = await chatRequest(messages, null, modelId);
		content.textContent = answer;
		const match = answer.match(/```(?:[a-zA-Z0-9_+-]+)?\n([\s\S]*?)```/);
		if (match && doc && !doc.binary) {
			const apply = el('button', { class: 'small-button', type: 'button' }, 'Apply code to current draft');
			apply.addEventListener('click', () => { ui.editor.value = match[1]; editText(); renderEditor(); toast('Draft updated. Use Save to write the selected local file.', 'success'); });
			output.append(apply);
		}
	} catch (error) { content.textContent = `Unavailable: ${error.message}`; }
	finally { setBusy(false); ui.copilotMessages.scrollTop = ui.copilotMessages.scrollHeight; }
}

async function downloadHfModel() {
	const repo = $('#hfRepo').value.trim(); if (!repo) { toast('Enter a Hugging Face model/repository ID.', 'warn'); return; }
	try {
		setBusy(true, `Requesting download for ${repo}…`);
		if (!await refreshRouterModels()) throw new Error('Hugging Face downloads require a Router-mode llama-server.');
		await watchModelProgress();
		const response = await fetch('/models', { method: 'POST', headers: headers(true), body: JSON.stringify({ model: repo, sidecars: [] }) });
		const body = await response.json().catch(() => ({}));
		if (!response.ok || body.success === false) throw new Error(body.error?.message || `HTTP ${response.status}: model download was rejected`);
		state.selectedCopilotModel = repo;
		await refreshRouterModels();
		renderCopilotModelSelect();
		toast(`Download request accepted for ${repo}. Check server events for progress.`, 'success');
		log(`Model download submitted: ${repo}`);
	} catch (error) { toast(`Download request failed: ${error.message}`, 'error'); log(error.message); }
	finally { setBusy(false); }
}
function watchModelProgress() {
	if (state.modelProgressReady) return state.modelProgressReady;
	state.watchingModelProgress = true;
	let readyResolve, readyReject, readySettled = false;
	state.modelProgressReady = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
	void (async () => {
		try {
			const response = await fetch('/models/sse', { headers: headers() });
			if (!response.ok || !response.body) throw new Error(`SSE HTTP ${response.status}`);
			readyResolve(); readySettled = true;
			const reader = response.body.getReader(), td = new TextDecoder(); let buffer = '';
			for (;;) {
				const { value, done } = await reader.read(); if (done) break;
				buffer += td.decode(value, { stream: true });
				const chunks = buffer.split(/\r?\n\r?\n/); buffer = chunks.pop() || '';
				for (const chunk of chunks) if (chunk.trim()) {
					log(`Model event: ${chunk.replace(/\s+/g, ' ').slice(0, 300)}`);
					if (/download_(finished|failed)|models_reload/.test(chunk)) {
						await refreshServerStatus();
						if (/download_failed/.test(chunk)) toast('Model download failed; see activity log.', 'error');
						else if (/download_finished/.test(chunk)) toast('Model download finished; refreshed model list.', 'success');
					}
				}
			}
			await refreshServerStatus();
		} catch (error) {
			if (!readySettled) readyReject(error);
			log(`Model progress stream unavailable: ${error.message}`);
		} finally { state.watchingModelProgress = false; state.modelProgressReady = null; }
	})();
	return state.modelProgressReady;
}

function prepareQuantizeCommand() {
	if (!state.selectedFile || !state.selectedFile.name.toLowerCase().endsWith('.gguf')) { toast('Select a GGUF input file first.', 'warn'); return; }
	const kind = $('#quantType').value;
	const output = state.selectedFile.name.replace(/\.gguf$/i, `-${kind}.gguf`);
	const command = `llama-quantize "${state.selectedFile.name.replaceAll('"', '\\"')}" "${output.replaceAll('"', '\\"')}" ${kind}`;
	$('#quantCommand').textContent = command;
	toast('Command prepared only. This web app has no quantization job endpoint; nothing was executed.', 'warn');
}
async function copyQuantizeCommand() {
	const command = $('#quantCommand').textContent;
	if (!command || command.startsWith('Select')) { prepareQuantizeCommand(); return; }
	try { await navigator.clipboard.writeText(command); toast('CLI command copied. Run it in a trusted terminal after verifying paths and disk space.', 'success'); }
	catch { toast('Clipboard permission unavailable; select and copy the command text.', 'warn'); }
}
function explainUnsupported(feature, reason) { toast(`${feature} is not exposed by the current web backend. ${reason}`, 'warn'); }
function setActivePanel(name) { renderPanel(name); }
function renderInitial() { renderEditor(); renderGguf(); renderHex(); renderSidebar('explorer'); renderPanel('inspect'); }

// Event delegation keeps every action explicit and avoids inline HTML execution.
document.addEventListener('click', async event => {
	const closeTabButton = event.target.closest('[data-close-path]');
	if (closeTabButton) { event.stopPropagation(); await closeTab(closeTabButton.dataset.closePath); return; }
	const button = event.target.closest('button'); if (!button) return;
	if (button.dataset.view) { renderSidebar(button.dataset.view); return; }
	if (button.dataset.rightTab) { renderPanel(button.dataset.rightTab); return; }
	if (button.dataset.openPath) { await openFilePath(button.dataset.openPath); return; }
	if (button.dataset.tabPath) { state.current = button.dataset.tabPath; renderEditor(); return; }
	if (button.dataset.closePath) { event.stopPropagation(); await closeTab(button.dataset.closePath); return; }
	const action = button.dataset.action;
	switch (action) {
		case 'open-folder': await openFolder(); break;
		case 'open-files': $('#singleFileInput').click(); break;
		case 'new-file': await newFile(); break;
		case 'save': await saveCurrent(); break;
		case 'reload': await reloadCurrent(); break;
		case 'export': if (state.selectedFile) downloadBlob(state.selectedFile, state.selectedFile.name); else toast('Choose a local GGUF file first.', 'warn'); break;
		case 'run': explainUnsupported('Run', 'A browser page cannot execute arbitrary source code or shell commands. Use a trusted local terminal.'); break;
		case 'copilot': renderPanel('copilot'); break;
		case 'settings': ui.modal.showModal(); break;
			case 'settings-close': ui.modal.close(); break;
			case 'refresh-api': await refreshServerStatus(); break;
			case 'refresh-models': await refreshServerStatus(); toast('Model list refreshed.', 'success'); break;
			case 'load-copilot-model': await loadCopilotModel(); break;
			case 'open-hex': renderPanel('hex'); break;
		case 'open-gguf': renderPanel('inspect'); break;
		case 'choose-model': $('#modelFileInput').click(); break;
		case 'save-metadata': await saveMetadataCopy(); break;
		case 'save-hex-copy': await saveHexCopy(); break;
		case 'hex-prev': state.hexOffset = Math.max(0, state.hexOffset - 256); renderHex(); renderBinary(); break;
		case 'hex-next': if (state.selectedFile) { state.hexOffset = Math.min(Math.max(0, state.selectedFile.size - 1), state.hexOffset + 256); renderHex(); renderBinary(); } break;
		case 'download-model': await downloadHfModel(); break;
		case 'quantize-prepare': prepareQuantizeCommand(); break;
		case 'quantize-copy': await copyQuantizeCommand(); break;
		case 'server-start': explainUnsupported('Start server', 'The repository has no browser API to launch the llama-server process. Start it from a trusted host terminal.'); break;
		case 'server-stop': explainUnsupported('Stop server', 'The repository has no browser API to stop llama-server. No process was signalled.'); break;
		case 'github': window.open('https://github.com/v1-byte/Forge-Editor', '_blank', 'noopener,noreferrer'); break;
		case 'git-push': explainUnsupported('Git push', 'This page has no GitHub credentials or push integration. Open the repository or use an authenticated Git client.'); break;
		case 'extensions': explainUnsupported('Extensions', 'The repository does not provide an extension marketplace/runtime.'); break;
		case 'format': {
			const doc = state.docs.get(state.current); if (!doc || doc.binary) { toast('Open a text file first.', 'warn'); break; }
			ui.editor.value = ui.editor.value.split('\n').map(line => line.replace(/[\t ]+$/g, '')).join('\n'); editText(); renderEditor(); toast('Trailing whitespace removed. This is not a language-aware formatter.', 'success'); break;
		}
		case 'copy-meta': {
			const text = state.gguf ? state.gguf.metadata.map(x => `${x.key} = ${displayValue(state.metadataEdits.get(x.key) ?? x.value)}`).join('\n') : '';
			if (!text) toast('No metadata is loaded.', 'warn'); else try { await navigator.clipboard.writeText(text); toast('Metadata copied.'); } catch { toast('Clipboard is unavailable.', 'warn'); }
			break;
		}
	}
});

document.addEventListener('input', event => {
	if (event.target === ui.editor) { const doc = state.docs.get(state.current); if (doc && !doc.binary) { doc.text = ui.editor.value; doc.dirty = true; ui.dirty.textContent = 'Unsaved changes'; ui.dirty.className = 'dirty-state dirty'; renderTabs(); renderTree(); } }
	if (event.target === ui.search) { state.search = ui.search.value; renderTree(); renderSearchResults(); }
});
document.addEventListener('change', event => {
	if (event.target === ui.modelSelect) state.selectedModel = ui.modelSelect.value;
	if (event.target === ui.copilotModelSelect) { state.selectedCopilotModel = ui.copilotModelSelect.value; renderCopilotModelSelect(); }
	if (event.target.id === 'formatOnSave') state.formatOnSave = event.target.checked;
});
$('#fileFallback').addEventListener('change', event => { const files = [...event.target.files]; void openPickedFiles(files); event.target.value = ''; });
$('#singleFileInput').addEventListener('change', event => { const files = [...event.target.files]; void openPickedFiles(files); event.target.value = ''; });
$('#clearLog').addEventListener('click', () => ui.terminal.replaceChildren());
$('#toggleLog').addEventListener('click', () => $('#terminal').classList.toggle('collapsed'));
$('#modelFileInput').addEventListener('change', async event => { const file = event.target.files?.[0]; if (file) await inspectGguf(file); event.target.value = ''; });
$('#sendLab').addEventListener('click', sendLabMessage);
ui.labInput.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendLabMessage(); } });
$('#sendCopilot').addEventListener('click', () => sendCopilot());
ui.copilotInput.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendCopilot(); } });
$('#searchCurrent').addEventListener('click', renderSearchResults);
$('#hfRepo').addEventListener('keydown', event => { if (event.key === 'Enter') downloadHfModel(); });
ui.editor.addEventListener('keydown', event => {
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveCurrent(); }
});
window.addEventListener('keydown', event => {
	if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { event.preventDefault(); document.body.classList.toggle('sidebar-collapsed'); }
});
$('#settingsDialog').addEventListener('close', () => { state.apiKey = $('#apiKey').value.trim(); refreshServerStatus(); });
$('#clearLab').addEventListener('click', () => { sessionStorage.removeItem('forge-lab-history'); renderMessages(ui.lab, []); });
$('#hexRows').addEventListener('click', event => {
	const byte = event.target.closest('[data-byte-index]'); if (!byte) return;
	const index = Number(byte.dataset.byteIndex);
	const input = prompt(`Set byte at offset 0x${index.toString(16)} (00–FF):`, (state.hexPatch?.get(index) ?? parseInt(byte.textContent, 16)).toString(16).padStart(2, '0'));
	if (input === null) return;
	if (!/^(?:0x)?[0-9a-f]{1,2}$/i.test(input.trim())) { toast('Enter one hex byte from 00 to FF.', 'error'); return; }
	if (!state.hexPatch) state.hexPatch = new Map(); state.hexPatch.set(index, parseInt(input.replace(/^0x/i, ''), 16)); renderHex();
});
$('#apiKey').addEventListener('change', () => { state.apiKey = $('#apiKey').value.trim(); });
state.formatOnSave = localStorage.getItem('forge-format-on-save') === 'true';
$('#formatOnSave').checked = state.formatOnSave;
$('#modelSelect').addEventListener('change', event => { state.selectedModel = event.target.value; });
$('#hexOffsetInput').addEventListener('change', event => {
	const raw = event.target.value.trim(); const value = /^0x/i.test(raw) ? parseInt(raw, 16) : Number(raw);
	if (!Number.isSafeInteger(value) || value < 0 || !state.selectedFile || value >= state.selectedFile.size) { toast('Offset must be a valid byte position in the selected file.', 'error'); event.target.value = state.hexOffset; return; }
	state.hexOffset = value; renderHex();
});
$('#formatOnSave').addEventListener('change', event => { state.formatOnSave = event.target.checked; localStorage.setItem('forge-format-on-save', String(state.formatOnSave)); });
$('#saveMetadata').disabled = true;
$('#exportCopy').disabled = true;
$('#openHex').disabled = true;
renderInitial();
const savedLab = JSON.parse(sessionStorage.getItem('forge-lab-history') || '[]');
if (savedLab.length) renderMessages(ui.lab, savedLab);
refreshServerStatus();
}
