import type { GripMode } from './grip-types';

export type GripStage = 'target' | 'base' | 'reference' | 'reference-second' | 'new-reference';
export function gripPrompt(mode: GripMode, stage: GripStage, korean = true): string {
  if (korean) {
    if (stage === 'base') return '기준점 지정:';
    if (stage === 'reference')
      return mode === 'SCALE' ? '참조 길이 지정 <1>:' : '참조 각도 지정 <0>:';
    if (stage === 'reference-second') return '두 번째 점 지정:';
    if (stage === 'new-reference') return mode === 'SCALE' ? '새 길이 지정:' : '새 각도 지정:';
    const subject = {
      STRETCH: '신축점',
      MOVE: '이동점',
      ROTATE: '회전 각도',
      SCALE: '축척 비율',
      MIRROR: '대칭선의 두 번째 점',
    }[mode];
    return `** ${{ STRETCH: '신축', MOVE: '이동', ROTATE: '회전', SCALE: '축척', MIRROR: '대칭' }[mode]} ** ${subject} 지정 또는 [기준점(B)/복사(C)/명령 취소(U)${mode === 'SCALE' || mode === 'ROTATE' ? '/참조(R)' : ''}/종료(X)]:`;
  }
  if (stage === 'base') return 'Specify base point:';
  if (stage === 'reference')
    return mode === 'SCALE' ? 'Specify reference length <1>:' : 'Specify reference angle <0>:';
  if (stage === 'reference-second') return 'Specify second point:';
  if (stage === 'new-reference')
    return mode === 'SCALE' ? 'Specify new length:' : 'Specify new angle:';
  const subject = {
    STRETCH: 'stretch point',
    MOVE: 'move point',
    ROTATE: 'rotation angle',
    SCALE: 'scale factor',
    MIRROR: 'second point of mirror line',
  }[mode];
  return `** ${mode} ** Specify ${subject} or [Base point(B)/Copy(C)/Undo(U)${mode === 'SCALE' || mode === 'ROTATE' ? '/Reference(R)' : ''}/eXit(X)]:`;
}
