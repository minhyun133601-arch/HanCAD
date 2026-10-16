import type { NavigationSnapshot } from './navigation-session';

export function navigationPrompt(
  snapshot: NavigationSnapshot,
  korean: boolean,
  height: number,
): string {
  const prompts = {
    zoom: korean
      ? '윈도우 구석 지정, 축척 비율(nX 또는 nXP) 입력 또는 [전체(A)/중심(C)/동적(D)/범위(E)/이전(P)/축척(S)/윈도우(W)/객체(O)] <실시간>:'
      : 'Specify corner of window, enter a scale factor (nX or nXP), or [All/Center/Dynamic/Extents/Previous/Scale/Window/Object] <real time>:',
    'window-first': korean ? '첫 번째 구석 지정:' : 'Specify first corner:',
    'window-second': korean ? '반대 구석 지정:' : 'Specify opposite corner:',
    center: korean ? '중심점 지정:' : 'Specify center point:',
    height: korean
      ? `배율 또는 높이 입력 <${height.toFixed(4)}>:`
      : `Enter magnification or height <${height.toFixed(4)}>:`,
    scale: korean ? '축척 비율(nX 또는 nXP) 입력:' : 'Enter a scale factor (nX or nXP):',
    objects: korean ? '객체 선택:' : 'Select objects:',
    'pan-base': korean ? '기준점 또는 변위 지정:' : 'Specify base point or displacement:',
    'pan-second': korean ? '두 번째 점 지정:' : 'Specify second point:',
    'realtime-pan': korean
      ? '마우스 버튼을 누른 채로 끌어서 초점이동하십시오. 종료하려면 Enter 또는 Esc 키를 누르십시오.'
      : 'Press and drag to pan. Press Enter or Esc to exit.',
    'realtime-zoom': korean
      ? '마우스 버튼을 누른 채로 위 또는 아래로 끌어서 줌하십시오. 종료하려면 Enter 또는 Esc 키를 누르십시오.'
      : 'Press and drag vertically to zoom. Press Enter or Esc to exit.',
    dynamic: korean
      ? '뷰 상자를 이동하고 클릭하여 크기를 조정하십시오. 뷰를 적용하려면 Enter 키를 누르십시오.'
      : 'Move the view box; click to switch sizing. Press Enter to apply the view.',
  };
  return prompts[snapshot.stage];
}
