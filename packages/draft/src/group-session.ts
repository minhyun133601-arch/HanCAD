import { normalizeCadState } from '@hancad/legacy-bridge';
import type { CadGroup, LegacyCadState } from '@hancad/legacy-bridge';
import { upsertCadGroup } from './selection-rules';

export type GroupTool = 'GROUP' | '-GROUP' | 'GROUPEDIT' | 'UNGROUP';
export class GroupSession {
  stage: 'select' | 'name' | 'description' | 'group' | 'option' | 'add' | 'remove' | 'rename' =
    'select';
  group?: CadGroup;
  private name = '';
  private description = '';
  constructor(
    readonly tool: GroupTool,
    private readonly options: {
      state: () => LegacyCadState;
      ids: () => readonly string[];
      clear: () => void;
      commit: (state: LegacyCadState) => void;
      print: (text: string) => void;
      finish: () => void;
      korean: () => boolean;
    },
  ) {
    if (tool === 'GROUPEDIT' || tool === 'UNGROUP') this.stage = 'group';
  }
  get editable(): boolean {
    return ['name', 'description', 'rename'].includes(this.stage);
  }
  get selecting(): boolean {
    return ['select', 'add', 'remove'].includes(this.stage);
  }
  get prompt(): string {
    const ko = this.options.korean();
    switch (this.stage) {
      case 'name':
        return ko ? '그룹 이름 입력:' : 'Enter group name:';
      case 'description':
        return ko ? '그룹 설명 입력:' : 'Enter group description:';
      case 'rename':
        return ko ? '새 그룹 이름 입력:' : 'Enter new group name:';
      case 'group':
        return ko ? '그룹 선택 또는 [이름(N)/전체(A)]:' : 'Select group or [Name/All]:';
      case 'option':
        return ko
          ? '옵션 입력 [객체 추가(A)/객체 제거(R)/이름 바꾸기(REN)]:'
          : 'Enter an option [Add objects/Remove objects/REName]:';
      default:
        return this.tool === 'GROUP' || this.tool === '-GROUP'
          ? ko
            ? '객체 선택 또는 [이름(N)/설명(D)]:'
            : 'Select objects or [Name/Description]:'
          : ko
            ? '객체 선택:'
            : 'Select objects:';
    }
  }
  pick(id: string): boolean {
    if (this.stage !== 'group') return false;
    const group = this.options.state().groups?.find((item) => item.ids.includes(id));
    if (!group)
      this.options.print(
        this.options.korean()
          ? '선택한 객체가 그룹의 구성원이 아닙니다.'
          : 'Selected object is not a member of a group.',
      );
    else this.choose(group);
    return true;
  }
  private choose(group: CadGroup): void {
    this.group = structuredClone(group);
    if (this.tool === 'UNGROUP') {
      this.options.commit(
        normalizeCadState({
          ...this.options.state(),
          groups: this.options.state().groups?.filter((item) => item.name !== group.name),
        }),
      );
      this.options.finish();
    } else this.stage = 'option';
  }
  private store(group: CadGroup): void {
    try {
      this.options.commit(upsertCadGroup(this.options.state(), group));
      this.options.finish();
    } catch (error) {
      this.options.print(error instanceof Error ? error.message : String(error));
    }
  }
  submit(input: string): boolean {
    const value = input.trim(),
      keyword = value.toUpperCase().replace(/^_/, '');
    if (this.stage === 'name') {
      this.name = value;
      this.stage = 'select';
      return true;
    }
    if (this.stage === 'description') {
      this.description = input;
      this.stage = 'select';
      return true;
    }
    if (this.stage === 'rename' && this.group) {
      if (
        this.options
          .state()
          .groups?.some(
            (item) => item.name.toUpperCase() === keyword && item.name !== this.group?.name,
          )
      ) {
        this.options.print(
          this.options.korean()
            ? '같은 이름의 그룹이 이미 있습니다.'
            : 'A group with that name already exists.',
        );
        return true;
      }
      try {
        const state = normalizeCadState({
          ...this.options.state(),
          groups: this.options.state().groups?.filter((item) => item.name !== this.group?.name),
        });
        this.options.commit(upsertCadGroup(state, { ...this.group, name: value }));
        this.options.finish();
      } catch (error) {
        this.options.print(error instanceof Error ? error.message : String(error));
      }
      return true;
    }
    if (this.stage === 'group') {
      if (keyword === 'N' || keyword === 'NAME') return true;
      if (keyword === '?') {
        this.options.print(
          this.options
            .state()
            .groups?.map((group) => group.name)
            .join(', ') ?? '',
        );
        return true;
      }
      if ((keyword === 'A' || keyword === 'ALL') && this.tool === 'UNGROUP') {
        this.options.commit(normalizeCadState({ ...this.options.state(), groups: [] }));
        this.options.finish();
        return true;
      }
      const group = this.options
        .state()
        .groups?.find((item) => item.name.toUpperCase() === keyword);
      if (group) this.choose(group);
      return true;
    }
    if (this.stage === 'option') {
      if (keyword === 'A' || keyword === 'ADD') {
        this.stage = 'add';
        this.options.clear();
      } else if (keyword === 'R' || keyword === 'REMOVE') {
        this.stage = 'remove';
        this.options.clear();
      } else if (keyword === 'REN' || keyword === 'RENAME') this.stage = 'rename';
      return true;
    }
    if (this.stage === 'select') {
      if (keyword === 'N' || keyword === 'NAME') {
        this.stage = 'name';
        return true;
      }
      if (keyword === 'D' || keyword === 'DESCRIPTION') {
        this.stage = 'description';
        return true;
      }
    }
    if (value) return false;
    const ids = [...this.options.ids()];
    if (this.stage === 'select') {
      if (!ids.length) {
        this.options.finish();
        return true;
      }
      let number = 1;
      while (this.options.state().groups?.some((group) => group.name === `*A${number}`)) number++;
      const name = this.name || `*A${number}`;
      if (
        this.options
          .state()
          .groups?.some((group) => group.name.toUpperCase() === name.toUpperCase())
      ) {
        this.options.print(
          this.options.korean()
            ? '같은 이름의 그룹이 이미 있습니다.'
            : 'A group with that name already exists.',
        );
        this.stage = 'name';
      } else this.store({ name, description: this.description, selectable: true, ids });
    } else if (this.group && this.stage === 'add')
      this.store({ ...this.group, ids: [...this.group.ids, ...ids] });
    else if (this.group && this.stage === 'remove')
      this.store({ ...this.group, ids: this.group.ids.filter((id) => !ids.includes(id)) });
    return true;
  }
}
