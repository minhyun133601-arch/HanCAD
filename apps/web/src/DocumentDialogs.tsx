import type { Locale, Messages } from '@hancad/ui';
import { ProgressDialog } from './ProgressDialog';
import { DimensionStyleDialog } from './DimensionStyleDialog';
import { DisplayOptionsDialog } from './DisplayOptionsDialog';
import type { useDimensions } from './useDimensions';
import type { useCommandSession } from './useCommandSession';
import type { useViewNavigation } from './useViewNavigation';
import type { useDrawingFiles } from './useDrawingFiles';
import { DrawingStyleDialogs } from './DrawingStyleDialogs';

export function DocumentDialogs({
  messages,
  locale,
  progressOpen,
  closeProgress,
  dimensions,
  session,
  navigation,
  focus,
  files,
}: {
  messages: Messages;
  locale: Locale;
  progressOpen: boolean;
  closeProgress: () => void;
  dimensions: ReturnType<typeof useDimensions>;
  session: ReturnType<typeof useCommandSession>;
  navigation: ReturnType<typeof useViewNavigation>;
  focus: () => void;
  files: ReturnType<typeof useDrawingFiles>;
}) {
  return (
    <>
      <DrawingStyleDialogs
        registry={session.registry}
        sysvars={session.sysvars}
        getState={files.getState}
        commitState={files.commitState}
        korean={locale === 'ko-KR'}
        focus={focus}
      />
      <ProgressDialog
        messages={messages}
        locale={locale}
        open={progressOpen}
        onClose={() => {
          closeProgress();
          focus();
        }}
      />
      <DimensionStyleDialog
        messages={messages}
        open={dimensions.styleOpen}
        sysvars={session.sysvars}
        selectedCount={dimensions.selectedDimensionCount}
        onApply={(values, selected) => {
          dimensions.applyStyle(values, selected);
          session.refresh();
        }}
        onClose={() => {
          dimensions.closeStyle();
          focus();
        }}
      />
      <DisplayOptionsDialog
        open={navigation.optionsOpen}
        korean={locale === 'ko-KR'}
        background={navigation.background}
        apply={navigation.setBackground}
        close={() => {
          navigation.setOptionsOpen(false);
          focus();
        }}
      />
    </>
  );
}
