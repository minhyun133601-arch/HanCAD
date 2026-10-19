import { useEffect, useRef, useState } from 'react';
import { ColorDialog } from './ColorDialog';
import { LinetypeDialog } from './LinetypeDialog';
import { LineweightDialog } from './LineweightDialog';
import { TransparencyDialog } from './TransparencyDialog';
import { LinetypeLibrary } from './linetype-library';
import { registerStyleCommands } from './register-style-commands';
import type { StyleManagerHost } from './types';
import './styles08.css';

type Dialog = 'color' | 'linetype' | 'lineweight' | 'transparency' | null;
export function useStyleManagers(host: StyleManagerHost) {
  const latest = useRef(host);
  latest.current = host;
  const [dialog, setDialog] = useState<Dialog>(null);
  const [library] = useState(() => new LinetypeLibrary(host.readSupportFile));
  const [initial, setInitial] = useState('BYLAYER');
  const onColor = useRef<((value: string) => void) | null>(null);
  const onProperty = useRef<((value: string) => void) | null>(null);
  const [propertyInitial, setPropertyInitial] = useState<string | undefined>();
  function openColor(value?: string, apply?: (value: string) => void): void {
    setInitial(value ?? String(latest.current.sysvars.get('CECOLOR')));
    onColor.current = apply ?? null;
    setDialog('color');
  }
  function close(): void {
    setDialog(null);
    latest.current.focus();
  }
  function openProperty(
    kind: 'linetype' | 'lineweight' | 'transparency',
    value?: string,
    apply?: (value: string) => void,
  ): void {
    onProperty.current = apply ?? null;
    setPropertyInitial(value);
    setDialog(kind);
  }
  useEffect(() => {
    registerStyleCommands(
      host,
      {
        color: () => openColor(),
        linetype: () => openProperty('linetype'),
        lineweight: () => openProperty('lineweight'),
        transparency: () => openProperty('transparency'),
      },
      library,
    );
  }, [host.registry, library]);
  const ko = host.locale === 'ko-KR';
  return {
    openColor,
    openLinetype: (value?: string, apply?: (value: string) => void) =>
      openProperty('linetype', value, apply),
    openLineweight: (value?: string, apply?: (value: string) => void) =>
      openProperty('lineweight', value, apply),
    openTransparency: (value?: string, apply?: (value: string) => void) =>
      openProperty('transparency', value, apply),
    dialogs:
      dialog === 'color' ? (
        <ColorDialog
          initial={initial}
          korean={ko}
          close={close}
          apply={(value) => {
            if (onColor.current) onColor.current(value);
            else host.sysvars.set('CECOLOR', value);
            close();
          }}
        />
      ) : dialog === 'linetype' ? (
        <LinetypeDialog
          database={host.database}
          sysvars={host.sysvars}
          library={library}
          korean={ko}
          close={close}
          {...(propertyInitial === undefined ? {} : { initial: propertyInitial })}
          {...(onProperty.current ? { onApply: onProperty.current } : {})}
        />
      ) : dialog === 'lineweight' ? (
        <LineweightDialog
          sysvars={host.sysvars}
          korean={ko}
          close={close}
          {...(propertyInitial === undefined ? {} : { initial: propertyInitial })}
          {...(onProperty.current ? { onApply: onProperty.current } : {})}
        />
      ) : dialog === 'transparency' ? (
        <TransparencyDialog
          sysvars={host.sysvars}
          korean={ko}
          close={close}
          {...(propertyInitial === undefined ? {} : { initial: propertyInitial })}
          {...(onProperty.current ? { onApply: onProperty.current } : {})}
        />
      ) : null,
  };
}
