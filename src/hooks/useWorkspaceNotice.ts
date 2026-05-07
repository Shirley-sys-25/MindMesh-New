import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceNotice } from '../lib/appTypes';

export const useWorkspaceNotice = () => {
  const [workspaceNotice, setWorkspaceNotice] = useState<WorkspaceNotice | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const showWorkspaceNotice = useCallback((tone: WorkspaceNotice['tone'], text: string) => {
    setWorkspaceNotice({ tone, text });

    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      setWorkspaceNotice(null);
      timeoutRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { workspaceNotice, showWorkspaceNotice };
};
