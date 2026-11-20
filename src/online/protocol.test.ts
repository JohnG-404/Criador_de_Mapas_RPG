import { describe, expect, it } from 'vitest';
import { MapDocument, FOG_HIDDEN } from '../core/doc/MapDocument';
import { ChunkAssembler, forPlayers, newRoomCode, toChunks, validRoomCode } from './protocol';

describe('sala online', () => {
  it('divide e junta o mapa em pedaços, fora de ordem e ignorando versões velhas', () => {
    const text = 'x'.repeat(1000) + 'fim';
    const v1 = toChunks(text, 1, 300);
    const v2 = toChunks('novo', 2, 300);
    expect(v1).toHaveLength(4);
    const asm = new ChunkAssembler();
    expect(asm.push(v1[3] as never)).toBeNull();
    expect(asm.push(v1[0] as never)).toBeNull();
    expect(asm.push(v1[0] as never)).toBeNull();
    expect(asm.push(v1[2] as never)).toBeNull();
    expect(asm.push(v1[1] as never)).toBe(text);
    expect(asm.push(v2[0] as never)).toBe('novo');
    expect(asm.push(v1[0] as never)).toBeNull();
  });

  it('códigos de sala são longos e aleatórios', () => {
    const a = newRoomCode(), b = newRoomCode();
    expect(a).not.toBe(b);
    expect(validRoomCode(a)).toBe(true);
    expect(validRoomCode('abc')).toBe(false);
    expect(validRoomCode('../x')).toBe(false);
  });

  it('jogadores não recebem notas nem inimigos escondidos pela névoa', () => {
    const doc = new MapDocument({ name: 't', gridKind: 'square', cols: 10, rows: 10, fill: 1, cellMeters: 1.5 });
    doc.notes.put('n', { id: 'n', x: 16, y: 16, text: 'segredo' });
    doc.tokens.put('a', { id: 'a', name: 'Orc', x: 16, y: 16, size: 1, color: '#b8322c' });
    doc.tokens.put('b', { id: 'b', name: 'Goblin', x: 200, y: 200, size: 1, color: '#b8322c' });
    doc.tokens.put('c', { id: 'c', name: 'Ana', x: 16, y: 48, size: 1, color: '#2e6fb5', pc: true, vision: 6 });
    doc.fog.set(0, 0, FOG_HIDDEN);
    doc.fog.set(0, 1, FOG_HIDDEN);
    doc.fog.flush();
    const m = forPlayers(doc);
    expect(m.notes).toEqual([]);
    expect(m.tokens.map((t) => t.name).sort()).toEqual(['Ana', 'Goblin']);
  });
});
