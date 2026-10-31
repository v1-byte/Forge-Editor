import { describe, expect, it } from 'vitest';
import { parseGgufBuffer, serializeGgufHeader } from '../../static/forge-editor-app.js';

function fixture(modelName = 'x') {
	const parts = [];
	const add = bytes => parts.push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
	const numeric = (size, write) => {
		const bytes = new Uint8Array(size);
		write(new DataView(bytes.buffer));
		add(bytes);
	};
	const u32 = value => numeric(4, view => view.setUint32(0, value, true));
	const u64 = value => numeric(8, view => view.setBigUint64(0, BigInt(value), true));
	const str = value => {
		const bytes = new TextEncoder().encode(value);
		u64(bytes.length);
		add(bytes);
	};
	add(new TextEncoder().encode('GGUF'));
	u32(3); // version
	u64(1); // tensors
	u64(3); // metadata entries
	str('general.alignment'); u32(4); u32(32);
	str('general.name'); u32(8); str(modelName);
	str('general.tags'); u32(9); u32(8); u64(2); str('alpha'); str('beta');
	str('tensor0'); u32(1); u64(4); u32(0); u64(0);
	const header = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let cursor = 0;
	for (const part of parts) { header.set(part, cursor); cursor += part.length; }
	const dataStart = Math.ceil(header.length / 32) * 32;
	const file = new Uint8Array(dataStart + 8);
	file.set(header);
	file.set([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88], dataStart);
	return file;
}

describe('Forge Editor GGUF parser and metadata copy header', () => {
	it('reads GGUF v3 metadata, tensor descriptors, and the aligned tensor-data start', () => {
		const parsed = parseGgufBuffer(fixture().buffer, 'fixture.gguf');
		expect(parsed.version).toBe(3);
		expect(parsed.tensorCount).toBe(1);
		expect(parsed.metadata.find(item => item.key === 'general.name').value).toBe('x');
		expect(parsed.metadata.find(item => item.key === 'general.tags').value).toMatchObject({ array: true, count: 2 });
		expect(parsed.tensors[0]).toMatchObject({ name: 'tensor0', type: 0, offset: 0n });
		expect(parsed.dataStart % 32).toBe(0);
	});

	it('writes an edited descriptive string into a separate header and preserves tensor-relative offsets when the header grows', () => {
		const source = fixture();
		const parsed = parseGgufBuffer(source.buffer, 'fixture.gguf');
		const editedName = 'Forge model name expanded beyond the previous alignment boundary';
		const { header, dataStart, oldDataStart } = serializeGgufHeader(parsed, new Map([['general.name', editedName]]));
		const output = new Uint8Array(dataStart + source.length - oldDataStart);
		output.set(header);
		output.set(source.subarray(oldDataStart), dataStart);
		const reparsed = parseGgufBuffer(output.buffer, 'fixture-edited.gguf');
		expect(dataStart).toBeGreaterThan(oldDataStart);
		const expectedShift = 0n;
		expect(reparsed.metadata.find(item => item.key === 'general.name').value).toBe(editedName);
		expect(reparsed.metadata.find(item => item.key === 'general.tags').value).toMatchObject({ array: true, count: 2 });
		expect(reparsed.tensors[0].offset).toBe(expectedShift);
		 expect(output.subarray(dataStart)).toEqual(source.subarray(oldDataStart));
	});

	it('rejects non-GGUF files and unsupported versions', () => {
		expect(() => parseGgufBuffer(new Uint8Array([1, 2, 3]).buffer)).toThrow(/not a GGUF/);
		const badVersion = fixture();
		new DataView(badVersion.buffer).setUint32(4, 1, true);
		expect(() => parseGgufBuffer(badVersion.buffer)).toThrow(/not supported/);
	});

	it('rejects edits to structural metadata keys', () => {
		const parsed = parseGgufBuffer(fixture().buffer, 'fixture.gguf');
		expect(() => serializeGgufHeader(parsed, new Map([['general.alignment', '64']]))).toThrow(/read-only/);
	});
});
