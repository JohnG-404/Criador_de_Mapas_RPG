import { describe, expect, it } from 'vitest';
import { cleanRoll, makeRoll, RollLog } from './rolls';

const gm = { autor: 'Mestre', papel: 'mestre' as const, skin: null };
const player = { autor: 'Ana', papel: 'jogador' as const, skin: 'gelo' };

describe('rolagens da mesa', () => {
  it('só o mestre faz rolagem oculta', () => {
    expect(makeRoll('d20', gm, { oculta: true }).oculta).toBe(true);
    expect(makeRoll('d20', player, { oculta: true }).oculta).toBe(false);
  });

  it('a rolagem passa pela rede sem mudar', () => {
    const r = makeRoll('4d6kh3+2', player, { rotulo: 'Força' });
    expect(cleanRoll(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it('total forjado é recalculado e lixo é recusado', () => {
    const r = makeRoll('2d6', player);
    expect(cleanRoll({ ...r, total: 999 })!.total).toBe(r.total);
    expect(cleanRoll({ ...r, termos: [{ tipo: 'dado', lados: 6, valores: [9], mantidos: [true] }] })).toBeNull();
    expect(cleanRoll({ ...r, id: '<script>' })).toBeNull();
    expect(cleanRoll('x')).toBeNull();
    // Rolagem oculta nunca chega oculta a quem recebe.
    expect(cleanRoll({ ...r, oculta: true })!.oculta).toBe(false);
  });

  it('a crônica esconde as ocultas dos jogadores e aceita a revelação', () => {
    const log = new RollLog();
    const secret = makeRoll('d20', gm, { oculta: true });
    log.upsert(secret);
    log.upsert(makeRoll('d6', player));
    expect(log.publicHistory()).toHaveLength(1);
    expect(log.upsert({ ...secret })).toBe(false);
    expect(log.upsert({ ...secret, oculta: false, revelada: true })).toBe(true);
    expect(log.publicHistory().at(-1)!.id).toBe(secret.id);
  });
});
