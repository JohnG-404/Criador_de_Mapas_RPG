import { describe, expect, it } from 'vitest';
import { attrCheck, DND, dndMod, HORROR, initiativeExpr, profBonus, saveBonus, skillCheck } from './systems';
import { cleanSheet, tokenTemplate, TOKEN_TEMPLATES } from '../doc/tokenTemplates';
import { isValidExpression } from '../dice/dice';

const skill = (rules: typeof DND, key: string) => rules.skills.find((s) => s.key === key)!;

describe('fichas', () => {
  it('modificadores e proficiência de D&D', () => {
    expect([dndMod(10), dndMod(11), dndMod(14), dndMod(8), dndMod(1)]).toEqual([0, 0, 2, -1, -5]);
    expect(profBonus({ hp: 1, hpMax: 1, def: 10, move: 9, level: 5 })).toBe(3);
    expect(profBonus({ hp: 1, hpMax: 1, def: 10, move: 9, prof: 4 })).toBe(4);
  });

  it('testes do goblin', () => {
    const g = tokenTemplate('goblin')!.sheet;
    expect(attrCheck(g, 1)).toBe('1d20+2');
    expect(skillCheck(g, skill(DND, 'furtividade'))).toBe('1d20+6');
    expect(saveBonus(g, 4)).toBe(-1);
    expect(initiativeExpr(g)).toBe('1d20+2');
  });

  it('testes de horror: atributo = quantidade de d20', () => {
    const s = tokenTemplate('atirador')!.sheet;
    expect(attrCheck(s, 0)).toBe('3d20kh1');
    expect(skillCheck(s, skill(HORROR, 'pontaria'))).toBe('3d20kh1+10');
    expect(initiativeExpr(s)).toBe('3d20kh1+5');
    expect(attrCheck(tokenTemplate('ocultista')!.sheet, 1)).toBe('2d20kl1');
  });

  it('modelos têm ficha completa e rolagens válidas', () => {
    for (const t of TOKEN_TEMPLATES) {
      expect(t.sheet.sys, t.key).toBe(t.system);
      expect(t.sheet.attrs?.length, t.key).toBe(t.system === 'dnd' ? 6 : 5);
      for (const a of t.sheet.attacks ?? []) {
        if (a.roll) expect(isValidExpression(a.roll), `${t.key} ${a.name}`).toBe(true);
        expect(isValidExpression(a.dmg), `${t.key} ${a.name}`).toBe(true);
      }
      expect(cleanSheet(t.sheet), t.key).toEqual(t.sheet);
    }
  });

  it('limpa campos inválidos da ficha', () => {
    const s = cleanSheet({
      hp: 5, hpMax: 10, def: 12, move: 9, sys: 'outro', attrs: [50, -3, 'x'], skills: { furtividade: 2, 'Inválida!': 1, zero: 0 },
      saves: [1, 1, 9], attacks: [{ name: 'A'.repeat(60), roll: 3, dmg: '1d6' }], conds: ['Caído', 'Caído', 4], notes: 'oi',
    })!;
    expect(s.sys).toBeUndefined();
    expect(s.attrs).toEqual([30, 0, 0]);
    expect(s.skills).toEqual({ furtividade: 2 });
    expect(s.saves).toEqual([1, 5]);
    expect(s.attacks).toEqual([{ name: 'A'.repeat(40), roll: '', dmg: '1d6' }]);
    expect(s.conds).toEqual(['Caído']);
    expect(s.notes).toBe('oi');
  });
});
