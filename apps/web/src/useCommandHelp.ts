import { useEffect, useRef, useState } from 'react';
import { commandCatalog, parsePrefixes } from '@hancad/commands';
import type { CommandRegistry } from '@hancad/commands';

/** HELP/F1 uses registry metadata without cancelling the command it explains. */
export function useCommandHelp(registry: CommandRegistry, commandName: string | null) {
  const active = useRef(commandName);
  const [topic, setTopic] = useState<string | null>(null);
  const name = commandName ? parsePrefixes(commandName).name : null;
  if (name !== 'HELP') active.current = name;
  useEffect(() => {
    const metadata = commandCatalog.get('HELP');
    if (!metadata) throw new Error('HELP metadata is missing');
    registry.register({ ...metadata, execute: () => setTopic(active.current ?? 'HELP') });
  }, [registry]);
  return { topic, select: setTopic, close: () => setTopic(null) };
}
